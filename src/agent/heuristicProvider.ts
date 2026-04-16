import type {
  ChatMessage,
  ProviderDecision,
  RuntimeTool,
  ToolCall,
} from "../types.js";
import type { AgentProvider, ProviderRequest } from "./provider.js";

export class HeuristicProvider implements AgentProvider {
  readonly label = "heuristic planner";

  async decide(request: ProviderRequest): Promise<ProviderDecision> {
    const lastMessage = request.messages.at(-1);

    if (!lastMessage) {
      return {
        assistantMessage:
          "Ask about repository state, diffs, branch validation, or staged commits.",
      };
    }

    if (lastMessage.role === "user") {
      return this.handleUserMessage(lastMessage.content);
    }

    if (lastMessage.role === "tool" && lastMessage.toolName) {
      return this.handleToolResult(
        lastMessage.toolName,
        lastMessage.content,
        request.messages,
      );
    }

    return { assistantMessage: "Ready for the next Git task." };
  }

  private handleUserMessage(content: string): ProviderDecision {
    const text = content.toLowerCase();

    if (text.includes("help")) {
      return {
        assistantMessage:
          "Try asking for repo status, staged diff, branch validation, or help committing staged changes.",
      };
    }

    if (
      /(status|what'?s going on|repo|working tree|dirty|ahead|behind)/.test(
        text,
      )
    ) {
      return { toolCalls: [{ name: "git_status", args: {} }] };
    }

    if (/(show|view).*(diff|changes)|\bdiff\b/.test(text)) {
      return {
        toolCalls: [
          {
            name: "git_diff",
            args: { staged: /(staged|cached)/.test(text) },
          },
        ],
      };
    }

    if (/(log|history|recent commits)/.test(text)) {
      return { toolCalls: [{ name: "git_log", args: { limit: 5 } }] };
    }

    if (/reflog/.test(text)) {
      return { toolCalls: [{ name: "git_reflog", args: { limit: 8 } }] };
    }

    if (/(validate|check).*(branch)|branch name/.test(text)) {
      return { toolCalls: [{ name: "git_validate_branch", args: {} }] };
    }

    if (/(commit|save).*staged|(commit|save) my changes/.test(text)) {
      return { toolCalls: [{ name: "git_status", args: {} }] };
    }

    const branchCreate = this.extractBranchCreate(content);
    if (branchCreate) {
      return {
        toolCalls: [
          {
            name: "git_branch_create",
            args: { name: branchCreate, checkout: true },
          },
        ],
      };
    }

    const checkoutTarget = this.extractCheckoutTarget(content);
    if (checkoutTarget) {
      return {
        toolCalls: [{ name: "git_checkout", args: { target: checkoutTarget } }],
      };
    }

    return {
      toolCalls: [{ name: "git_status", args: {} }],
    };
  }

  private handleToolResult(
    toolName: string,
    rawContent: string,
    messages: ChatMessage[],
  ): ProviderDecision {
    const payload = safeParse(rawContent);
    const recentIntent = this.findRecentUserIntent(messages);

    if (toolName === "git_status" && payload) {
      if (recentIntent === "commit") {
        if ((payload.staged as number) > 0) {
          return {
            toolCalls: [{ name: "git_suggest_commit_message", args: {} }],
          };
        }

        if (
          (payload.unstaged as number) > 0 ||
          (payload.untracked as number) > 0
        ) {
          return {
            assistantMessage:
              "There are no staged changes to commit yet. Stage the files you want included, then ask me to commit again.",
          };
        }
      }

      return {
        assistantMessage: describeStatus(payload),
      };
    }

    if (toolName === "git_suggest_commit_message" && payload) {
      const message = String(payload.message ?? "");
      return {
        assistantMessage: `Prepared commit message: ${message}. Approve to create the commit.`,
        toolCalls: [{ name: "git_commit", args: { message } }],
      };
    }

    if (toolName === "git_validate_branch" && payload) {
      const suggestion = payload.suggestion
        ? ` Suggested name: ${payload.suggestion}.`
        : "";
      return {
        assistantMessage: `${payload.message}${suggestion}`,
      };
    }

    if (toolName === "git_diff" && payload) {
      const staged = payload.staged ? "staged" : "working tree";
      return {
        assistantMessage: `Showing ${staged} diff:\n${String(payload.diff)}`,
      };
    }

    if (toolName === "git_log" && payload) {
      const lines = Array.isArray(payload.entries)
        ? payload.entries
            .map(
              (entry) => `${entry.hash} ${entry.relativeTime} ${entry.subject}`,
            )
            .join("\n")
        : "No history available.";
      return { assistantMessage: `Recent commits:\n${lines}` };
    }

    if (toolName === "git_reflog" && payload) {
      const lines = Array.isArray(payload.entries)
        ? payload.entries
            .map((entry) => `${entry.hash} ${entry.subject}`)
            .join("\n")
        : "No reflog entries available.";
      return { assistantMessage: `Recent reflog entries:\n${lines}` };
    }

    if (toolName === "git_commit" && payload) {
      return {
        assistantMessage: `Commit created with message '${payload.message}'.`,
      };
    }

    if (toolName === "git_branch_create" && payload) {
      return {
        assistantMessage: `Created branch '${payload.name}' and switched to it.`,
      };
    }

    if (toolName === "git_checkout" && payload) {
      return {
        assistantMessage: `Checked out '${payload.target}'.`,
      };
    }

    return {
      assistantMessage:
        "The tool finished, but I do not have a tailored summary for that result yet.",
    };
  }

  private findRecentUserIntent(
    messages: ChatMessage[],
  ): "commit" | "status" | "other" {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "user") {
        continue;
      }

      const text = message.content.toLowerCase();
      if (/(commit|save)/.test(text)) {
        return "commit";
      }

      if (/(status|repo|what'?s going on)/.test(text)) {
        return "status";
      }

      return "other";
    }

    return "other";
  }

  private extractBranchCreate(content: string): string | null {
    const match = content.match(
      /(?:create|make).*(?:branch).*(?:called|named)?\s+([a-zA-Z0-9._/-]+)/i,
    );
    return match?.[1] ?? null;
  }

  private extractCheckoutTarget(content: string): string | null {
    const match = content.match(/(?:checkout|switch to)\s+([a-zA-Z0-9._/-]+)/i);
    return match?.[1] ?? null;
  }
}

function safeParse(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function describeStatus(payload: Record<string, any>): string {
  const pieces: string[] = [];

  if (!payload.isGitRepo) {
    return "This directory is not a Git repository.";
  }

  pieces.push(`On branch ${payload.branch}.`);

  if (payload.branchValid === false) {
    pieces.push(String(payload.branchValidationMessage));
  }

  if (payload.clean) {
    pieces.push("Working tree is clean.");
  } else {
    pieces.push(
      `Working tree has ${payload.staged} staged, ${payload.unstaged} unstaged, ${payload.untracked} untracked, and ${payload.conflicted} conflicted paths.`,
    );
  }

  if ((payload.ahead as number) > 0 || (payload.behind as number) > 0) {
    pieces.push(
      `Branch divergence: ahead ${payload.ahead}, behind ${payload.behind}.`,
    );
  }

  if (payload.conflicted) {
    pieces.push(
      "Resolve conflicts before any commit, merge, or branch switch.",
    );
  } else if (payload.staged) {
    pieces.push("You have staged work ready for commit.");
  } else if (payload.unstaged || payload.untracked) {
    pieces.push("Next safe move is to review or stage the changes.");
  }

  return pieces.join(" ");
}

export function listToolNames(tools: RuntimeTool[]): string[] {
  return tools.map((tool) => tool.name);
}

export function buildSingleToolCall(
  name: string,
  args: Record<string, unknown>,
): ToolCall {
  return { name, args };
}
