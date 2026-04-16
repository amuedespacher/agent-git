import { describe, expect, it } from "vitest";

import { analyzeDiff } from "../src/git/tools.js";

describe("analyzeDiff", () => {
  it("extracts structured diff metadata for AI grounding", () => {
    const diff = [
      "diff --git a/src/ui/App.tsx b/src/ui/App.tsx",
      "index 1111111..2222222 100644",
      "--- a/src/ui/App.tsx",
      "+++ b/src/ui/App.tsx",
      "@@ -1,3 +1,4 @@",
      ' import { Box } from "ink";',
      '+import SelectInput from "ink-select-input";',
      '-const prompt = "approve> ";',
      '+const prompt = "chat> ";',
      "diff --git a/tests/policy.test.ts b/tests/policy.test.ts",
      "index 3333333..4444444 100644",
      "--- a/tests/policy.test.ts",
      "+++ b/tests/policy.test.ts",
      "@@ -5,0 +6,2 @@",
      '+it("new case", () => {});',
      "+expect(true).toBe(true);",
      "diff --git a/package.json b/package.json",
      "index 5555555..6666666 100644",
      "--- a/package.json",
      "+++ b/package.json",
      "@@ -1,0 +1 @@",
      '+"parse-diff": "^0.11.1"',
      "",
    ].join("\n");

    const analysis = analyzeDiff(diff);

    expect(analysis.filesChanged).toBe(2);
    expect(analysis.additions).toBe(6);
    expect(analysis.deletions).toBe(2);
    expect(analysis.touchesTests).toBe(false);
    expect(analysis.touchesConfig).toBe(true);
    expect(analysis.fileExtensions).toContain("tsx");
    expect(analysis.topScopes).toContain("src/ui");
  });
});
