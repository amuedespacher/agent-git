import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";

import { AgentRuntime } from "../agent/runtime.js";
import type { RuntimeSnapshot, ToolEvent } from "../types.js";

interface AppProps {
  cwd: string;
}

export function App({ cwd }: AppProps) {
  const { exit } = useApp();
  const [runtime] = useState(() => new AgentRuntime(cwd));
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(runtime.snapshot);
  const [input, setInput] = useState("");

  useEffect(() => {
    const unsubscribe = runtime.subscribe(setSnapshot);
    void runtime.initialize();
    return unsubscribe;
  }, [runtime]);

  const submit = async () => {
    const value = input;
    setInput("");
    if (value.trim() === "/quit") {
      exit();
      return;
    }
    await runtime.submit(value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header snapshot={snapshot} cwd={cwd} />
      <Box marginTop={1}>
        <Sidebar snapshot={snapshot} />
        <MainPanel snapshot={snapshot} />
      </Box>
      <Footer
        input={input}
        onChange={setInput}
        onSubmit={submit}
        pendingApproval={Boolean(snapshot.pendingApproval)}
        busy={snapshot.busy}
        awaitingOpenAIKey={snapshot.openAISetup.awaitingKey}
      />
    </Box>
  );
}

function Header({ snapshot, cwd }: { snapshot: RuntimeSnapshot; cwd: string }) {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color="cyan">git-agent v1</Text>
      <Text>
        repo: {snapshot.repo.root ?? cwd} | branch:{" "}
        {snapshot.repo.branch ?? "n/a"} | provider: {snapshot.providerLabel}
      </Text>
    </Box>
  );
}

function Sidebar({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const repo = snapshot.repo;

  return (
    <Box width={38} flexDirection="column" marginRight={1}>
      <Box
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        flexDirection="column"
      >
        <Text color="green">Repo State</Text>
        <Text>clean: {repo.clean ? "yes" : "no"}</Text>
        <Text>staged: {repo.staged}</Text>
        <Text>unstaged: {repo.unstaged}</Text>
        <Text>untracked: {repo.untracked}</Text>
        <Text>conflicted: {repo.conflicted}</Text>
        <Text>
          divergence: +{repo.ahead} / -{repo.behind}
        </Text>
        <Text color={repo.branchValid === false ? "yellow" : "white"}>
          branch policy: {repo.branchValid === false ? "needs attention" : "ok"}
        </Text>
      </Box>
      <Box
        borderStyle="round"
        borderColor="magenta"
        paddingX={1}
        flexDirection="column"
        marginTop={1}
      >
        <Text color="magenta">Review</Text>
        {snapshot.pendingApproval ? (
          <>
            <Text>{snapshot.pendingApproval.summary}</Text>
            <Text color="yellow">Reply with y or n</Text>
          </>
        ) : (
          <Text>No guarded action pending.</Text>
        )}
      </Box>
      <Box
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        flexDirection="column"
        marginTop={1}
      >
        <Text color="blue">Recent Tools</Text>
        {snapshot.toolEvents.length === 0 ? (
          <Text>No tool activity yet.</Text>
        ) : (
          snapshot.toolEvents
            .slice(-5)
            .map((event) => <ToolEventLine key={event.id} event={event} />)
        )}
      </Box>
    </Box>
  );
}

function ToolEventLine({ event }: { event: ToolEvent }) {
  const color =
    event.status === "failed"
      ? "red"
      : event.status === "pending-approval"
        ? "yellow"
        : event.status === "completed"
          ? "green"
          : "white";

  return <Text color={color}>{`${event.toolName}: ${event.status}`}</Text>;
}

function MainPanel({ snapshot }: { snapshot: RuntimeSnapshot }) {
  if (snapshot.mode === "settings") {
    return <SettingsPanel snapshot={snapshot} />;
  }

  return (
    <Box
      flexGrow={1}
      borderStyle="round"
      borderColor="white"
      paddingX={1}
      flexDirection="column"
    >
      <Text color="white">Chat</Text>
      {snapshot.messages.slice(-12).map((message) => {
        const color =
          message.role === "assistant"
            ? "cyan"
            : message.role === "user"
              ? "green"
              : "yellow";
        const label =
          message.role === "tool" ? `${message.toolName}` : message.role;
        return (
          <Box key={message.id} marginTop={1}>
            <Text color={color}>{label}: </Text>
            <Text>{message.content}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function SettingsPanel({ snapshot }: { snapshot: RuntimeSnapshot }) {
  return (
    <Box
      flexGrow={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      flexDirection="column"
    >
      <Text color="yellow">Settings</Text>
      <Text>provider: {snapshot.config.provider.kind}</Text>
      <Text>model: {snapshot.config.provider.model}</Text>
      <Text>
        openai key: {snapshot.openAISetup.hasStoredKey ? "saved" : "not saved"}
      </Text>
      <Text>config file: {snapshot.openAISetup.configPath}</Text>
      <Text>commit style: {snapshot.config.commitStyle}</Text>
      <Text>safety level: {snapshot.config.safetyLevel}</Text>
      <Text>branch pattern: {snapshot.config.branchPattern}</Text>
      <Text>verbosity: {snapshot.config.verbosity}</Text>
      {snapshot.openAISetup.lastMessage ? (
        <Text color="green">{snapshot.openAISetup.lastMessage}</Text>
      ) : null}
      {snapshot.openAISetup.lastError ? (
        <Text color="red">
          connection error: {snapshot.openAISetup.lastError}
        </Text>
      ) : null}
      {snapshot.openAISetup.awaitingKey ? (
        <Text color="yellow">
          Paste your OpenAI API key below and press Enter. Type /cancel to
          abort.
        </Text>
      ) : (
        <Text color="gray">
          Use /connect-openai to enter and test an OpenAI API key.
        </Text>
      )}
      <Text color="gray">Use /chat to return to the conversation.</Text>
    </Box>
  );
}

function Footer({
  input,
  onChange,
  onSubmit,
  pendingApproval,
  busy,
  awaitingOpenAIKey,
}: {
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  pendingApproval: boolean;
  busy: boolean;
  awaitingOpenAIKey: boolean;
}) {
  const prompt = awaitingOpenAIKey
    ? "openai-key> "
    : pendingApproval
      ? "approve> "
      : "chat> ";

  return (
    <Box borderStyle="round" borderColor="cyan" marginTop={1} paddingX={1}>
      <Text color="cyan">{prompt}</Text>
      <TextInput
        value={input}
        mask={awaitingOpenAIKey ? "*" : undefined}
        onChange={onChange}
        onSubmit={() => void onSubmit()}
      />
      <Box marginLeft={1}>
        <Text color={busy ? "yellow" : "gray"}>
          {busy ? "working" : "ready"}
        </Text>
      </Box>
    </Box>
  );
}
