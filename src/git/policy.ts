import path from "node:path";

import type { CommitStyle } from "../types.js";

export interface BranchValidationResult {
  valid: boolean;
  pattern: string;
  message: string;
  suggestion?: string;
}

export interface CommitSuggestionInput {
  branchName?: string;
  files: string[];
  style: CommitStyle;
  keywords?: string[];
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

export function suggestCommitMessage(input: CommitSuggestionInput): string {
  const normalizedFiles = input.files.map((file) => file.toLowerCase());
  const type = inferCommitType(normalizedFiles, input.branchName);
  const subject = inferSubject(input.files, input.keywords ?? []);

  if (input.style === "sentence") {
    return capitalize(`${type === "docs" ? "document" : "update"} ${subject}`);
  }

  return `${type}: ${subject}`;
}

function inferCommitType(files: string[], branchName?: string): string {
  if (files.every((file) => file.endsWith(".md") || file.startsWith("docs/"))) {
    return "docs";
  }

  if (files.every((file) => file.includes("test") || file.includes("spec"))) {
    return "test";
  }

  if (
    files.some((file) => file === "package.json" || file.endsWith("lock.json"))
  ) {
    return "chore";
  }

  if (branchName?.startsWith("fix/")) {
    return "fix";
  }

  if (branchName?.startsWith("feature/")) {
    return "feat";
  }

  return "chore";
}

function inferSubject(files: string[], keywords: string[]): string {
  const keywordSubject = inferSubjectFromKeywords(keywords);
  if (keywordSubject) {
    return keywordSubject;
  }

  if (files.length === 0) {
    return "update staged changes";
  }

  if (files.length === 1) {
    return `update ${describeFile(files[0])}`;
  }

  if (files.length === 2) {
    return `update ${describeFile(files[0])} and ${describeFile(files[1])}`;
  }

  if (files.length <= 4) {
    const subjects = files.map(describeFile);
    const head = subjects.slice(0, -1).join(", ");
    const tail = subjects.at(-1);
    return `update ${head}, and ${tail}`;
  }

  return `update ${files.length} files`;
}

function inferSubjectFromKeywords(keywords: string[]): string | null {
  const set = new Set(keywords.map((word) => word.toLowerCase()));
  const hasAny = (...terms: string[]) => terms.some((term) => set.has(term));

  if (
    hasAny("stage", "staged", "staging", "git_stage_all") &&
    hasAny("suggest", "suggestion", "message", "messages", "commit")
  ) {
    return "improve commit staging and message suggestions";
  }

  if (hasAny("stage", "staged", "staging", "git_stage_all")) {
    return "improve staging flow";
  }

  if (hasAny("suggest", "suggestion", "message", "messages")) {
    return "improve commit message suggestions";
  }

  if (hasAny("status", "diff", "porcelain")) {
    return "improve git status and diff handling";
  }

  return null;
}

function describeFile(file: string): string {
  const base = path.basename(file, path.extname(file));
  return base.replace(/[-_]+/g, " ");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
