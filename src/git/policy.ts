export interface BranchValidationResult {
  valid: boolean;
  pattern: string;
  message: string;
  suggestion?: string;
}

export function slugifyBranchName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

export function validateBranchName(
  branchName: string,
  pattern: string,
): BranchValidationResult {
  if (["main", "master", "dev", "develop"].includes(branchName)) {
    return {
      valid: true,
      pattern,
      message: `Branch '${branchName}' is always allowed.`,
    };
  }

  const matcher = new RegExp(pattern);
  const valid = matcher.test(branchName);

  if (valid) {
    return {
      valid: true,
      pattern,
      message: `Branch '${branchName}' matches the configured policy.`,
    };
  }

  const parts = branchName.split("/").filter(Boolean);
  const topic = slugifyBranchName(parts.at(-1) ?? branchName) || "work-item";

  return {
    valid: false,
    pattern,
    message: `Branch '${branchName}' does not match ${pattern}.`,
    suggestion: `feature/${topic}`,
  };
}
