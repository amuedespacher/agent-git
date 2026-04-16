import OpenAI from "openai";

import type { ProviderDecision, RuntimeTool } from "../types.js";
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

function toOpenAIMessages(request: ProviderRequest) {
  const systemPrompt = buildSystemPrompt(request.tools);
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

function buildSystemPrompt(tools: RuntimeTool[]): string {
  const toolList = tools
    .map((tool) => `- ${tool.name}: ${tool.description} (risk: ${tool.risk})`)
    .join("\n");

  return [
    "You are git-agent, a terminal-native Git assistant.",
    "Use tools to inspect repository state before suggesting risky actions.",
    "Prefer safe, explainable steps.",
    "Only call write tools when the action is directly requested or clearly required.",
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
