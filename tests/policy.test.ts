import { describe, expect, it } from "vitest";

import { suggestCommitMessage, validateBranchName } from "../src/git/policy.js";
import { parsePorcelainV2 } from "../src/git/tools.js";

describe("validateBranchName", () => {
  it("accepts matching names", () => {
    const result = validateBranchName(
      "feature/agent-loop",
      "^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$",
    );

    expect(result.valid).toBe(true);
  });

  it("suggests a valid replacement for invalid names", () => {
    const result = validateBranchName(
      "Agent Loop",
      "^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$",
    );

    expect(result.valid).toBe(false);
    expect(result.suggestion).toBe("feature/agent-loop");
  });
});

describe("suggestCommitMessage", () => {
  it("uses feat for feature branches with conventional commits", () => {
    const message = suggestCommitMessage({
      branchName: "feature/tool-runtime",
      files: ["src/agent/runtime.ts"],
      style: "conventional",
    });

    expect(message).toBe("feat: update runtime");
  });

  it("generates descriptive message for staging and suggestion improvements", () => {
    const message = suggestCommitMessage({
      branchName: "feature/openai-integration",
      files: [
        "src/agent/heuristicProvider.ts",
        "src/agent/runtime.ts",
        "src/git/tools.ts",
      ],
      style: "conventional",
      keywords: ["staged", "git_stage_all", "suggest", "message", "commit"],
    });

    expect(message).toBe(
      "feat: improve commit staging and message suggestions",
    );
  });

  it("lists file subjects instead of generic count for small multi-file commits", () => {
    const message = suggestCommitMessage({
      branchName: "feature/openai-integration",
      files: [
        "src/agent/heuristicProvider.ts",
        "src/agent/runtime.ts",
        "src/git/tools.ts",
      ],
      style: "conventional",
    });

    expect(message).toBe("feat: update heuristicProvider, runtime, and tools");
  });
});

describe("parsePorcelainV2", () => {
  it("parses branch, divergence, and file counters", () => {
    const parsed = parsePorcelainV2(
      `
# branch.head feature/tool-runtime
# branch.upstream origin/feature/tool-runtime
# branch.ab +2 -1
1 M. N... 100644 100644 100644 abc abc file.ts
1 .M N... 100644 100644 100644 abc abc other.ts
? new-file.ts
`.trim(),
    );

    expect(parsed.branch).toBe("feature/tool-runtime");
    expect(parsed.upstream).toBe("origin/feature/tool-runtime");
    expect(parsed.ahead).toBe(2);
    expect(parsed.behind).toBe(1);
    expect(parsed.staged).toBe(1);
    expect(parsed.unstaged).toBe(1);
    expect(parsed.untracked).toBe(1);
  });
});
