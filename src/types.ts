export type SafetyLevel = "strict" | "balanced" | "permissive";
export type RiskLevel = "safe" | "low" | "high";
export type CommitStyle = "conventional" | "sentence";
export type Verbosity = "minimal" | "normal" | "detailed";
export type ProviderKind = "heuristic" | "openai";
export type UiMode = "chat" | "settings";

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  apiKeyEnv: string;
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
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
  toolName?: string;
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
