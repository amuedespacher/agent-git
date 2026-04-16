import { z } from "zod";

import type { AppConfig, RepoSnapshot } from "../types.js";
import { runGit } from "./exec.js";
import { suggestCommitMessage, validateBranchName } from "./policy.js";

const diffArgsSchema = z.object({
  staged: z.boolean().default(false),
  maxLines: z.number().int().positive().max(400).default(120),
});

const logArgsSchema = z.object({
  limit: z.number().int().positive().max(20).default(5),
});

const branchValidationArgsSchema = z.object({
  branchName: z.string().optional(),
});

const commitArgsSchema = z.object({
  message: z.string().min(1),
});

const branchCreateArgsSchema = z.object({
  name: z.string().min(1),
  checkout: z.boolean().default(true),
});

const checkoutArgsSchema = z.object({
  target: z.string().min(1),
});

const mergeArgsSchema = z.object({
  source: z.string().min(1),
});

export function createGitTools(cwd: string, config: AppConfig) {
  return {
    git_status: {
      schema: z.object({}),
      jsonSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => getStatus(cwd, config),
    },
    git_diff: {
      schema: diffArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          staged: { type: "boolean" },
          maxLines: { type: "number" },
        },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = diffArgsSchema.parse(args);
        return getDiff(cwd, parsed.staged, parsed.maxLines);
      },
    },
    git_log: {
      schema: logArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = logArgsSchema.parse(args);
        return getLog(cwd, parsed.limit);
      },
    },
    git_branch_list: {
      schema: z.object({}),
      jsonSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => getBranchList(cwd),
    },
    git_reflog: {
      schema: logArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = logArgsSchema.parse(args);
        return getReflog(cwd, parsed.limit);
      },
    },
    git_validate_branch: {
      schema: branchValidationArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { branchName: { type: "string" } },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = branchValidationArgsSchema.parse(args);
        return validateBranch(cwd, config, parsed.branchName);
      },
    },
    git_suggest_commit_message: {
      schema: z.object({}),
      jsonSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => suggestCommit(cwd, config),
    },
    git_stage_all: {
      schema: z.object({}),
      jsonSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => stageAll(cwd),
    },
    git_commit: {
      schema: commitArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = commitArgsSchema.parse(args);
        return commit(cwd, parsed.message);
      },
    },
    git_branch_create: {
      schema: branchCreateArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          checkout: { type: "boolean" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = branchCreateArgsSchema.parse(args);
        return createBranch(cwd, parsed.name, parsed.checkout);
      },
    },
    git_checkout: {
      schema: checkoutArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { target: { type: "string" } },
        required: ["target"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = checkoutArgsSchema.parse(args);
        return checkout(cwd, parsed.target);
      },
    },
    git_merge: {
      schema: mergeArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { source: { type: "string" } },
        required: ["source"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = mergeArgsSchema.parse(args);
        return merge(cwd, parsed.source);
      },
    },
  };
}

export async function getStatus(
  cwd: string,
  config: AppConfig,
): Promise<RepoSnapshot> {
  const root = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const porcelain = await runGit(cwd, ["status", "--porcelain=v2", "--branch"]);
  const parsed = parsePorcelainV2(porcelain);
  const stagedFiles = splitLines(
    await runGit(cwd, ["diff", "--cached", "--name-only"]),
  );
  const unstagedTrackedFiles = splitLines(
    await runGit(cwd, ["diff", "--name-only"]),
  );
  const untrackedFiles = splitLines(
    await runGit(cwd, ["ls-files", "--others", "--exclude-standard"]),
  );
  const unstagedFiles = dedupe([...unstagedTrackedFiles, ...untrackedFiles]);
  const branchValidation = parsed.branch
    ? validateBranchName(parsed.branch, config.branchPattern)
    : undefined;

  return {
    isGitRepo: true,
    root,
    branch: parsed.branch,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    untracked: parsed.untracked,
    conflicted: parsed.conflicted,
    clean:
      parsed.staged === 0 &&
      parsed.unstaged === 0 &&
      parsed.untracked === 0 &&
      parsed.conflicted === 0,
    branchValid: branchValidation?.valid,
    branchValidationMessage: branchValidation?.message,
    branchSuggestion: branchValidation?.suggestion,
    stagedFiles,
    unstagedFiles,
  };
}

export async function getDiff(cwd: string, staged: boolean, maxLines: number) {
  const args = staged
    ? ["diff", "--cached", "--stat", "--patch", "--no-ext-diff"]
    : ["diff", "--stat", "--patch", "--no-ext-diff"];
  const output = await runGit(cwd, args);
  return {
    staged,
    diff: truncateLines(output, maxLines),
  };
}

export async function getLog(cwd: string, limit: number) {
  const output = await runGit(cwd, [
    "log",
    `--max-count=${limit}`,
    "--pretty=format:%h%x09%an%x09%ar%x09%s",
  ]);
  return {
    entries: output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, author, relativeTime, subject] = line.split("\t");
        return { hash, author, relativeTime, subject };
      }),
  };
}

export async function getBranchList(cwd: string) {
  const output = await runGit(cwd, [
    "branch",
    "--format=%(refname:short)%09%(upstream:short)",
  ]);
  return {
    branches: output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, upstream] = line.split("\t");
        return { name, upstream: upstream || null };
      }),
  };
}

export async function getReflog(cwd: string, limit: number) {
  const output = await runGit(cwd, [
    "reflog",
    `--max-count=${limit}`,
    "--pretty=format:%h%x09%gs",
  ]);
  return {
    entries: output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, subject] = line.split("\t");
        return { hash, subject };
      }),
  };
}

export async function validateBranch(
  cwd: string,
  config: AppConfig,
  branchName?: string,
) {
  const current =
    branchName || (await runGit(cwd, ["branch", "--show-current"]));
  return validateBranchName(current, config.branchPattern);
}

export async function suggestCommit(cwd: string, config: AppConfig) {
  const status = await getStatus(cwd, config);
  // Prefer staged files for partial-commit workflows.
  // If nothing is staged yet, fall back to unstaged files so the assistant
  // can still suggest a meaningful message before auto-staging on commit.
  const files =
    status.stagedFiles.length > 0 ? status.stagedFiles : status.unstagedFiles;
  const usingStagedChanges = status.stagedFiles.length > 0;
  const diffOutput = await runGit(cwd, [
    "diff",
    ...(usingStagedChanges ? ["--cached"] : []),
    "--patch",
    "--no-ext-diff",
    "--unified=0",
  ]);
  const keywords = extractCommitKeywords(diffOutput);

  return {
    branch: status.branch,
    files,
    message: suggestCommitMessage({
      branchName: status.branch,
      files,
      style: config.commitStyle,
      keywords,
    }),
  };
}

export async function stageAll(cwd: string) {
  await runGit(cwd, ["add", "--all"]);
  const stagedFiles = splitLines(
    await runGit(cwd, ["diff", "--cached", "--name-only"]),
  );
  return {
    staged: stagedFiles.length,
    stagedFiles,
  };
}

export async function commit(cwd: string, message: string) {
  // Always stage all changes immediately before commit.
  await runGit(cwd, ["add", "--all"]);
  const output = await runGit(cwd, ["commit", "-m", message]);
  return { message, output };
}

export async function createBranch(
  cwd: string,
  name: string,
  checkoutNew: boolean,
) {
  const output = checkoutNew
    ? await runGit(cwd, ["checkout", "-b", name])
    : await runGit(cwd, ["branch", name]);
  return { name, checkout: checkoutNew, output };
}

export async function checkout(cwd: string, target: string) {
  const output = await runGit(cwd, ["checkout", target]);
  return { target, output };
}

export async function merge(cwd: string, source: string) {
  const output = await runGit(cwd, ["merge", source]);
  return { source, output };
}

export interface ParsedPorcelainStatus {
  branch?: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  stagedFiles: string[];
  unstagedFiles: string[];
}

export function parsePorcelainV2(output: string): ParsedPorcelainStatus {
  const state: ParsedPorcelainStatus = {
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    stagedFiles: [],
    unstagedFiles: [],
  };

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }

    if (line.startsWith("# branch.head ")) {
      state.branch = line.slice("# branch.head ".length).trim();
      continue;
    }

    if (line.startsWith("# branch.upstream ")) {
      state.upstream = line.slice("# branch.upstream ".length).trim();
      continue;
    }

    if (line.startsWith("# branch.ab ")) {
      const [aheadToken, behindToken] = line
        .slice("# branch.ab ".length)
        .trim()
        .split(" ");
      state.ahead = Number(aheadToken.replace("+", ""));
      state.behind = Number(behindToken.replace("-", ""));
      continue;
    }

    if (line.startsWith("? ")) {
      state.untracked += 1;
      continue;
    }

    if (line.startsWith("u ")) {
      state.conflicted += 1;
      const parts = line.split("\t");
      const filePath = parts[1];
      if (filePath) {
        state.unstagedFiles.push(filePath);
      }
      continue;
    }

    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const tokens = line.split(" ");
      const xy = tokens[1] ?? "..";
      const stagedCode = xy[0] ?? ".";
      const unstagedCode = xy[1] ?? ".";
      const parts = line.split("\t");
      const filePath = parts[1];

      if (stagedCode !== ".") {
        state.staged += 1;
        if (filePath) {
          state.stagedFiles.push(filePath);
        }
      }

      if (unstagedCode !== ".") {
        state.unstaged += 1;
        if (filePath && !state.unstagedFiles.includes(filePath)) {
          state.unstagedFiles.push(filePath);
        }
      }
    }
  }

  return state;
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");

  if (lines.length <= maxLines) {
    return text;
  }

  return `${lines.slice(0, maxLines).join("\n")}\n... truncated ${lines.length - maxLines} more lines`;
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function extractCommitKeywords(diff: string): string[] {
  const keywords = new Set<string>();
  const lines = diff.split("\n");

  for (const line of lines) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@") ||
      (!line.startsWith("+") && !line.startsWith("-"))
    ) {
      continue;
    }

    const content = line.slice(1);
    for (const token of tokenize(content)) {
      keywords.add(token);
      if (keywords.size >= 20) {
        return [...keywords];
      }
    }
  }

  return [...keywords];
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/["'`()[\]{}.,:;!?]/g, " ")
    .split(/[^a-z0-9_]+/)
    .filter((part) => part.length >= 4);
}
