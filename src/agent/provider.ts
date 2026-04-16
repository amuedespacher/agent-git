import type {
  AppConfig,
  ChatMessage,
  ProviderDecision,
  RuntimeTool,
} from "../types.js";

export interface ProviderRequest {
  config: AppConfig;
  messages: ChatMessage[];
  tools: RuntimeTool[];
}

export interface AgentProvider {
  readonly label: string;
  decide(request: ProviderRequest): Promise<ProviderDecision>;
}
