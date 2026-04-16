import OpenAI from "openai";

import type { AppConfig, ProviderDecision, RuntimeTool } from "../types.js";
import type { AgentProvider, ProviderRequest } from "./provider.js";

export class OpenAIProvider implements AgentProvider {
  readonly label: string;
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
    this.#model = options.model;
    this.label = `openai:${options.model}`;
  }

  async decide(request: ProviderRequest): Promise<ProviderDecision> {
    const completion = await this.#client.chat.completions.create({
      model: this.#model,
      temperature: 0.2,
      messages: toOpenAIMessages(request),
      tools: request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.jsonSchema,
        },
      })),
    });

    const message = completion.choices[0]?.message;

    if (!message) {
      return { assistantMessage: "The model did not return a response." };
    }

    if (message.tool_calls?.length) {
      return {
        assistantMessage: textFromContent(message.content),
        toolCalls: message.tool_calls.map((call) => ({
          name: call.function.name,
          args: JSON.parse(call.function.arguments || "{}"),
        })),
      };
    }

    return {
      assistantMessage: textFromContent(message.content),
    };
  }
}

export async function testOpenAIConnection(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}) {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
  });

  const models = await client.models.list();
  const availableModels = models.data.map((model) => model.id);

  return {
    ok: true,
    model: options.model,
    modelAvailable: availableModels.includes(options.model),
    availableModels,
  };
}

function toOpenAIMessages(request: ProviderRequest) {
  const systemPrompt = buildSystemPrompt(request.tools, request.config);
  return [
    { role: "system" as const, content: systemPrompt },
    ...request.messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        if (message.role === "tool") {
          return {
            role: "user" as const,
            content: `tool_result ${message.toolName}: ${message.content}`,
          };
        }

        return {
          role:
            message.role === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content: message.content,
        };
      }),
  ];
}

function buildSystemPrompt(tools: RuntimeTool[], config: AppConfig): string {
  const toolList = tools
    .map((tool) => `- ${tool.name}: ${tool.description} (risk: ${tool.risk})`)
    .join("\n");

  const verbosityInstruction =
    config.verbosity === "minimal"
      ? [
          "Be terse. The user is a senior developer; skip explanations and pleasantries if not necessary.",
          "Favour batching related operations (e.g. stage + commit + push in one go) when safe.",
          "Suggest next steps as a single short line, not a list.",
        ].join(" ")
      : config.verbosity === "detailed"
        ? [
            "Be thorough and educational. The user may be new to Git.",
            "Explain what each action does and why it is safe before executing.",
            "After completing a task, give clear, step-by-step guidance on what to do next.",
          ].join(" ")
        : [
            "Be concise but complete. Omit obvious context; include enough detail to be actionable.",
            "Suggest 1-2 relevant next steps after each task.",
          ].join(" ");

  return [
    "You are Agent Git, a terminal-native Git assistant.",
    verbosityInstruction,
    "Never include raw git commands (e.g. `git push -u origin main`) in your replies. Describe actions in plain English; you have tools to execute them.",
    "Never ask the user questions. Questions are reserved exclusively for the confirmation prompts that the UI presents before executing actions.",
    "Instead of asking 'What would you like to do next?', state the logical next step and why: e.g. 'The next logical step would be to push to the remote, since the commit is now local.'",
    "The user decides whether to follow suggestions — your role is to inform and act, not to inquire.",
    "Use tools to inspect repository state before suggesting risky actions.",
    "Prefer safe, explainable steps.",
    "Only call write tools when the action is directly requested or clearly required.",
    "For commit requests, call git_suggest_commit_message before proposing or executing git_commit.",
    "git_suggest_commit_message returns context, not final wording; synthesize the final commit message yourself.",
    "When git_suggest_commit_message returns analysis metadata, use it as grounding for commit wording.",
    "Avoid generic commit subjects such as 'update files' or 'update N files'. Prefer intent-focused subjects.",
    "After completing a task, state the next logical step and the reason for it. Keep it to one or two sentences.",
    "",
    "Available tools:",
    toolList,
  ].join("\n");
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === "string"
          ? item
          : (item as { text?: string }).text || "",
      )
      .join("\n");
  }

  return "";
}
