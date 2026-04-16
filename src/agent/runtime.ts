import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  defaultConfig,
  defaultOpenAIModel,
  getUserConfigPath,
  loadConfig,
  saveUserConfig,
} from "../config/index.js";
import { isGitRepository } from "../git/exec.js";
import { createGitTools } from "../git/tools.js";
import type {
  AppConfig,
  ChatMessage,
  PendingApproval,
  ProviderDecision,
  RepoSnapshot,
  RuntimeSnapshot,
  RuntimeTool,
  ToolCall,
  ToolEvent,
  UiMode,
} from "../types.js";
import { OpenAIProvider, testOpenAIConnection } from "./openaiProvider.js";
import type { AgentProvider } from "./provider.js";

type Listener = (snapshot: RuntimeSnapshot) => void;
type OpenAISetupState = RuntimeSnapshot["openAISetup"];

const emptyRepo: RepoSnapshot = {
  isGitRepo: false,
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  conflicted: 0,
  clean: true,
  stagedFiles: [],
  unstagedFiles: [],
};

const defaultOpenAISetup: OpenAISetupState = {
  awaitingKey: false,
  testing: false,
  hasStoredKey: false,
  configPath: getUserConfigPath(),
};

export class AgentRuntime {
  readonly #cwd: string;
  readonly #listeners = new Set<Listener>();
  readonly #messages: ChatMessage[] = [];
  readonly #toolEvents: ToolEvent[] = [];

  #config: AppConfig | null = null;
  #provider: AgentProvider | null = null;
  #busy = false;
  #mode: UiMode = "chat";
  #pendingApproval?: PendingApproval;
  #repo: RepoSnapshot = emptyRepo;
  #tools: RuntimeTool[] = [];
  #openAISetup = defaultOpenAISetup;

  constructor(cwd: string) {
    this.#cwd = cwd;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  get snapshot(): RuntimeSnapshot {
    return {
      messages: [...this.#messages],
      toolEvents: [...this.#toolEvents].slice(-8),
      repo: this.#repo,
      pendingApproval: this.#pendingApproval,
      busy: this.#busy,
      mode: this.#mode,
      config: this.#config ?? defaultConfig,
      providerLabel: this.#provider?.label ?? "not ready",
      openAISetup: this.#openAISetup,
    };
  }

  async initialize(): Promise<void> {
    this.#config = await loadConfig(this.#cwd);
    this.#syncOpenAISetup();
    this.#provider = this.#createProvider(this.#config);
    this.#tools = this.#buildTools(this.#config);

    if (!this.#provider) {
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: true,
        testing: false,
        lastError: undefined,
        lastMessage:
          "Set up OpenAI to start: paste your API key below and press Enter. Type /cancel to abort.",
      };
      this.#mode = "settings";
    }

    const repoDetected = await isGitRepository(this.#cwd);

    if (repoDetected) {
      this.#repo = (await this.#executeTool(
        { name: "git_status", args: {} },
        false,
      )) as RepoSnapshot;
      this.#addAssistantMessage(
        "git-agent is ready. Ask about repo state, staged work, branch validation, or run /connect-openai to configure OpenAI.",
      );
    } else {
      this.#repo = emptyRepo;
      this.#addAssistantMessage(
        "This directory is not a Git repository yet. Change into a repo before using Git tools, or run /connect-openai to configure OpenAI first.",
      );
    }

    this.#emit();
  }

  setMode(mode: UiMode): void {
    this.#mode = mode;
    this.#emit();
  }

  async refresh(): Promise<void> {
    if (!this.#tools.length) {
      return;
    }

    if (!this.#repo.isGitRepo) {
      const repoDetected = await isGitRepository(this.#cwd);
      if (!repoDetected) {
        this.#addAssistantMessage("Still not inside a Git repository.");
        this.#emit();
        return;
      }
    }

    await this.#executeTool({ name: "git_status", args: {} }, true);
    this.#addAssistantMessage("Repository state refreshed.");
    this.#emit();
  }

  async submit(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    if (this.#pendingApproval) {
      await this.#handleApprovalReply(trimmed);
      return;
    }

    if (this.#openAISetup.awaitingKey) {
      await this.#handleOpenAIKeyInput(trimmed);
      return;
    }

    if (await this.#handleSlashCommand(trimmed)) {
      return;
    }

    if (!this.#provider) {
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: true,
        testing: false,
        lastError: undefined,
        lastMessage:
          "OpenAI is not configured yet. Paste your API key below and press Enter.",
      };
      this.#mode = "settings";
      this.#emit();
      return;
    }

    this.#messages.push(this.#message("user", trimmed));
    await this.#runAgentLoop();
  }

  async resolveApproval(approved: boolean): Promise<void> {
    if (!this.#pendingApproval) {
      return;
    }

    const pending = this.#pendingApproval;
    this.#pendingApproval = undefined;

    if (!approved) {
      this.#addAssistantMessage(`Cancelled ${pending.call.name}.`);
      this.#emit();
      return;
    }

    await this.#executeTool(pending.call, true);
    await this.#runAgentLoop();
  }

  #createProvider(config: AppConfig): AgentProvider | null {
    const apiKey =
      config.provider.apiKey ?? process.env[config.provider.apiKeyEnv];

    if (!apiKey) {
      this.#messages.push(
        this.#message(
          "assistant",
          `Missing an OpenAI API key in saved config or ${config.provider.apiKeyEnv}. Run /connect-openai or paste your key now to continue.`,
        ),
      );
      return null;
    }

    return new OpenAIProvider({
      apiKey,
      model: config.provider.model,
      baseUrl: config.provider.baseUrl,
    });
  }

  #buildTools(config: AppConfig): RuntimeTool[] {
    const gitTools = createGitTools(this.#cwd, config);

    return [
      {
        name: "git_status",
        description:
          "Inspect repository status, branch divergence, staged work, and branch policy.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_status.schema,
        jsonSchema: gitTools.git_status.jsonSchema,
        execute: gitTools.git_status.execute,
      },
      {
        name: "git_diff",
        description:
          "Read the current diff from the working tree or the staged index.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_diff.schema,
        jsonSchema: gitTools.git_diff.jsonSchema,
        execute: gitTools.git_diff.execute,
      },
      {
        name: "git_log",
        description: "Read recent commit history.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_log.schema,
        jsonSchema: gitTools.git_log.jsonSchema,
        execute: gitTools.git_log.execute,
      },
      {
        name: "git_branch_list",
        description:
          "List local branches and their upstream tracking branches.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_branch_list.schema,
        jsonSchema: gitTools.git_branch_list.jsonSchema,
        execute: gitTools.git_branch_list.execute,
      },
      {
        name: "git_reflog",
        description: "Read recent reflog entries for recovery guidance.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_reflog.schema,
        jsonSchema: gitTools.git_reflog.jsonSchema,
        execute: gitTools.git_reflog.execute,
      },
      {
        name: "git_validate_branch",
        description:
          "Validate a branch name against the configured naming policy.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_validate_branch.schema,
        jsonSchema: gitTools.git_validate_branch.jsonSchema,
        execute: gitTools.git_validate_branch.execute,
      },
      {
        name: "git_suggest_commit_message",
        description:
          "Generate a commit message suggestion from staged changes, or unstaged changes when none are staged yet.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_suggest_commit_message.schema,
        jsonSchema: gitTools.git_suggest_commit_message.jsonSchema,
        execute: gitTools.git_suggest_commit_message.execute,
      },
      {
        name: "git_stage_all",
        description: "Stage all tracked and untracked changes.",
        risk: "safe",
        requiresConfirmation: false,
        inputSchema: gitTools.git_stage_all.schema,
        jsonSchema: gitTools.git_stage_all.jsonSchema,
        execute: gitTools.git_stage_all.execute,
      },
      {
        name: "git_commit",
        description: "Create a Git commit using the provided message.",
        risk: "low",
        requiresConfirmation: true,
        inputSchema: gitTools.git_commit.schema,
        jsonSchema: gitTools.git_commit.jsonSchema,
        execute: gitTools.git_commit.execute,
      },
      {
        name: "git_branch_create",
        description: "Create a new branch and optionally switch to it.",
        risk: "low",
        requiresConfirmation: true,
        inputSchema: gitTools.git_branch_create.schema,
        jsonSchema: gitTools.git_branch_create.jsonSchema,
        execute: gitTools.git_branch_create.execute,
      },
      {
        name: "git_checkout",
        description: "Switch the working tree to another branch or commit.",
        risk: "low",
        requiresConfirmation: true,
        inputSchema: gitTools.git_checkout.schema,
        jsonSchema: gitTools.git_checkout.jsonSchema,
        execute: gitTools.git_checkout.execute,
      },
      {
        name: "git_merge",
        description: "Merge a source branch into the current branch.",
        risk: "low",
        requiresConfirmation: true,
        inputSchema: gitTools.git_merge.schema,
        jsonSchema: gitTools.git_merge.jsonSchema,
        execute: gitTools.git_merge.execute,
      },
    ];
  }

  async #runAgentLoop(): Promise<void> {
    if (!this.#provider || !this.#config) {
      return;
    }

    this.#busy = true;
    this.#emit();

    for (let step = 0; step < 6; step += 1) {
      let decision: ProviderDecision;

      try {
        decision = await this.#provider.decide({
          config: this.#config,
          messages: this.#messages,
          tools: this.#tools,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.#addAssistantMessage(`Provider error: ${message}`);
        break;
      }

      if (decision.assistantMessage?.trim()) {
        this.#addAssistantMessage(decision.assistantMessage.trim());
      }

      const calls = decision.toolCalls ?? [];

      if (calls.length === 0) {
        break;
      }

      for (const call of calls) {
        const tool = this.#lookupTool(call.name);
        if (!tool) {
          this.#addAssistantMessage(`Unknown tool requested: ${call.name}.`);
          continue;
        }

        if (tool.requiresConfirmation) {
          this.#pendingApproval = {
            call,
            risk: tool.risk,
            summary: `Approve ${tool.name} with ${JSON.stringify(call.args)}?`,
          };
          this.#recordToolEvent(
            tool.name,
            "pending-approval",
            this.#pendingApproval.summary,
            tool.risk,
          );
          this.#busy = false;
          this.#emit();
          return;
        }

        await this.#executeTool(call, true);
      }
    }

    this.#busy = false;
    this.#emit();
  }

  async #executeTool(call: ToolCall, emitAfter = true): Promise<unknown> {
    const tool = this.#lookupTool(call.name);

    if (!tool) {
      throw new Error(`Tool '${call.name}' is not registered.`);
    }

    const validatedArgs = validateArgs(tool.inputSchema, call.args);
    this.#recordToolEvent(
      tool.name,
      "started",
      JSON.stringify(validatedArgs),
      tool.risk,
    );

    try {
      const result = await tool.execute(validatedArgs);
      const serialized = JSON.stringify(result);
      this.#messages.push(this.#message("tool", serialized, tool.name));
      this.#recordToolEvent(
        tool.name,
        "completed",
        summarizeToolResult(result),
        tool.risk,
      );

      if (tool.name === "git_status") {
        this.#repo = result as RepoSnapshot;
      }

      if (
        [
          "git_commit",
          "git_stage_all",
          "git_branch_create",
          "git_checkout",
          "git_merge",
        ].includes(tool.name)
      ) {
        const statusTool = this.#lookupTool("git_status");
        if (statusTool) {
          const statusResult = (await statusTool.execute({})) as RepoSnapshot;
          this.#repo = statusResult;
        }
      }

      if (emitAfter) {
        this.#emit();
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#recordToolEvent(tool.name, "failed", message, tool.risk);
      this.#addAssistantMessage(`Tool ${tool.name} failed: ${message}`);
      this.#busy = false;
      this.#emit();
      throw error;
    }
  }

  async #handleApprovalReply(input: string): Promise<void> {
    const normalized = input.trim().toLowerCase();

    if (["y", "yes", "/approve"].includes(normalized)) {
      await this.resolveApproval(true);
      return;
    }

    if (["n", "no", "/reject"].includes(normalized)) {
      await this.resolveApproval(false);
      return;
    }

    this.#addAssistantMessage(
      "A guarded action is pending. Reply with y or n.",
    );
    this.#emit();
  }

  async #handleSlashCommand(input: string): Promise<boolean> {
    if (input === "/help") {
      this.#addAssistantMessage(
        "Commands: /help, /settings, /chat, /refresh, /connect-openai. Ask me about repo status, diffs, branch validation, or staged commits.",
      );
      this.#emit();
      return true;
    }

    if (input === "/settings") {
      this.setMode("settings");
      return true;
    }

    if (input === "/chat") {
      this.setMode("chat");
      return true;
    }

    if (input === "/refresh") {
      await this.refresh();
      return true;
    }

    if (input === "/connect-openai") {
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: true,
        testing: false,
        lastError: undefined,
        lastMessage:
          "Paste your OpenAI API key and press Enter. The connection will be tested and then saved to the user config file. Type /cancel to abort.",
      };
      this.#mode = "settings";
      this.#emit();
      return true;
    }

    return false;
  }

  async #handleOpenAIKeyInput(input: string): Promise<void> {
    if (input === "/cancel") {
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: false,
        testing: false,
        lastMessage: "OpenAI setup cancelled.",
        lastError: undefined,
      };
      this.#emit();
      return;
    }

    const key = input.trim();
    const currentConfig = this.#config ?? defaultConfig;
    const model = currentConfig.provider.model || defaultOpenAIModel;

    this.#openAISetup = {
      ...this.#openAISetup,
      testing: true,
      lastError: undefined,
      lastMessage: "Testing OpenAI connection...",
    };
    this.#busy = true;
    this.#emit();

    try {
      const connection = await testOpenAIConnection({
        apiKey: key,
        model,
        baseUrl: currentConfig.provider.baseUrl,
      });

      await saveUserConfig({
        provider: {
          kind: "openai",
          model,
          apiKeyEnv: currentConfig.provider.apiKeyEnv,
          baseUrl: currentConfig.provider.baseUrl,
          apiKey: key,
        },
      });

      this.#config = await loadConfig(this.#cwd);
      this.#provider = this.#createProvider(this.#config);
      this.#tools = this.#buildTools(this.#config);
      this.#syncOpenAISetup();
      const successMessage = connection.modelAvailable
        ? `Connected to OpenAI and saved your key. Active model: ${model}.`
        : `Connected to OpenAI and saved your key. The key is valid, but ${model} is not listed in your visible models.`;
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: false,
        testing: false,
        lastError: undefined,
        lastMessage: successMessage,
      };
      this.#addAssistantMessage(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#openAISetup = {
        ...this.#openAISetup,
        awaitingKey: true,
        testing: false,
        lastError: message,
        lastMessage: undefined,
      };
      this.#addAssistantMessage(`OpenAI connection failed: ${message}`);
    }

    this.#busy = false;
    this.#emit();
  }

  #lookupTool(name: string): RuntimeTool | undefined {
    return this.#tools.find((tool) => tool.name === name);
  }

  #recordToolEvent(
    toolName: string,
    status: ToolEvent["status"],
    summary: string,
    risk: ToolEvent["risk"],
  ): void {
    this.#toolEvents.push({
      id: randomUUID(),
      toolName,
      status,
      summary,
      risk,
      createdAt: Date.now(),
    });
  }

  #message(
    role: ChatMessage["role"],
    content: string,
    toolName?: string,
  ): ChatMessage {
    return {
      id: randomUUID(),
      role,
      content,
      toolName,
      createdAt: Date.now(),
    };
  }

  #addAssistantMessage(content: string): void {
    this.#messages.push(this.#message("assistant", content));
  }

  #syncOpenAISetup(): void {
    const config = this.#config ?? defaultConfig;

    this.#openAISetup = {
      ...this.#openAISetup,
      hasStoredKey: Boolean(config.provider.apiKey),
      lastError: undefined,
      lastMessage:
        config.provider.kind === "openai" && config.provider.apiKey
          ? `OpenAI is configured with model ${config.provider.model}.`
          : undefined,
    };
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) {
      listener(snapshot);
    }
  }
}

function validateArgs(
  schema: unknown,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (schema instanceof z.ZodType) {
    return schema.parse(args);
  }

  return args;
}

function summarizeToolResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return String(result);
  }

  const json = JSON.stringify(result);
  return json.length > 140 ? `${json.slice(0, 140)}...` : json;
}
