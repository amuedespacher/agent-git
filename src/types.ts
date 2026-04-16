export type SafetyLevel = "strict" | "balanced" | "permissive";
export type RiskLevel = "safe" | "low" | "high";
export type CommitStyle = "conventional" | "sentence";
export type Verbosity = "minimal" | "normal" | "detailed";
export type ProviderKind = "openai";
export type UiMode = "chat" | "settings";

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  apiKeyEnv: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AppConfig {
  provider: ProviderConfig;
  commitStyle: CommitStyle;
  branchPattern: string;
  safetyLevel: SafetyLevel;
  verbosity: Verbosity;
}

export interface RepoSnapshot {
  isGitRepo: boolean;
  root?: string;
  branch?: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  clean: boolean;
  branchValid?: boolean;
  branchValidationMessage?: string;
  branchSuggestion?: string;
  stagedFiles: string[];
  unstagedFiles: string[];
}

export interface ChatMessageOption {
  label: string;
  value: string;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
  toolName?: string;
  visible?: boolean; // defaults to true, false to hide tool calls
  options?: ChatMessageOption[]; // for inline options/choices
  toolSummary?: string; // user-friendly summary instead of full JSON
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  rationale?: string;
}

export interface ToolEvent {
  id: string;
  toolName: string;
  status: "started" | "completed" | "failed" | "pending-approval";
  summary: string;
  risk: RiskLevel;
  createdAt: number;
}

export interface PendingApproval {
  call: ToolCall;
  risk: RiskLevel;
  summary: string;
  options?: ChatMessageOption[]; // predefined options for approval
}

export interface RuntimeSnapshot {
  messages: ChatMessage[];
  toolEvents: ToolEvent[];
  repo: RepoSnapshot;
  pendingApproval?: PendingApproval;
  busy: boolean;
  mode: UiMode;
  config: AppConfig;
  providerLabel: string;
  openAISetup: {
    awaitingKey: boolean;
    testing: boolean;
    hasStoredKey: boolean;
    configPath: string;
    lastMessage?: string;
    lastError?: string;
  };
  suggestionsEnabled?: boolean; // whether to show next action suggestions
}

export interface ProviderDecision {
  assistantMessage?: string;
  toolCalls?: ToolCall[];
}

export interface RuntimeTool {
  name: string;
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  inputSchema: unknown;
  jsonSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}
