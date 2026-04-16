import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";

import { AgentRuntime } from "../agent/runtime.js";
import type { RuntimeSnapshot } from "../types.js";

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
        <Text>
          divergence: +{repo.ahead} / -{repo.behind}
        </Text>
        <Text color={repo.branchValid === false ? "yellow" : "white"}>
          branch policy: {repo.branchValid === false ? "needs attention" : "ok"}
        </Text>
      </Box>
      <Box
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        flexDirection="column"
        marginTop={1}
      >
        <Text color="blue">Changed Files</Text>
        {repo.staged === 0 && repo.unstaged === 0 ? (
          <Text color="gray">No changes</Text>
        ) : (
          <>
            {repo.staged > 0 && (
              <>
                <Text color="green">Staged ({repo.staged})</Text>
                {repo.stagedFiles.slice(0, 5).map((file) => (
                  <Text key={file} color="green">
                    + {file}
                  </Text>
                ))}
                {repo.staged > 5 && (
                  <Text color="green">... +{repo.staged - 5} more</Text>
                )}
              </>
            )}
            {repo.unstaged > 0 && (
              <>
                <Text color="yellow">Unstaged ({repo.unstaged})</Text>
                {repo.unstagedFiles.slice(0, 5).map((file) => (
                  <Text key={file} color="yellow">
                    ~ {file}
                  </Text>
                ))}
                {repo.unstaged > 5 && (
                  <Text color="yellow">... ~{repo.unstaged - 5} more</Text>
                )}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
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
      {snapshot.messages
        .slice(-10)
        .filter((msg) => msg.visible !== false)
        .map((message) => {
          const color =
            message.role === "assistant"
              ? "cyan"
              : message.role === "user"
                ? "green"
                : "yellow";
          const label =
            message.role === "tool" ? `${message.toolName}` : message.role;

          return (
            <Box key={message.id} flexDirection="column" marginTop={1}>
              <Box>
                <Text color={color}>{label}: </Text>
                <Text>
                  {message.role === "tool" && message.toolSummary
                    ? message.toolSummary
                    : message.content}
                </Text>
              </Box>
              {message.options && message.options.length > 0 && (
                <Box marginTop={0} marginLeft={2} flexDirection="column">
                  {message.options.map((option, idx) => (
                    <Text key={option.value} color="yellow">
                      [{idx + 1}] {option.label}
                    </Text>
                  ))}
                </Box>
              )}
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
      ? "choose> "
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
