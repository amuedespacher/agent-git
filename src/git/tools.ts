import parseDiff from "parse-diff";
import { z } from "zod";

import type { AppConfig, RepoSnapshot } from "../types.js";
import { runGit } from "./exec.js";
import { validateBranchName } from "./policy.js";

const diffArgsSchema = z.object({
  staged: z.boolean().default(false),
  maxLines: z.number().int().positive().max(400).default(120),
});

const logArgsSchema = z.object({
  limit: z.number().int().positive().max(200).default(5),
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

const branchDeleteArgsSchema = z.object({
  name: z.string().min(1),
  force: z.boolean().default(false),
});

const checkoutArgsSchema = z.object({
  target: z.string().min(1),
});

const mergeArgsSchema = z.object({
  source: z.string().min(1),
});

const remoteSetArgsSchema = z.object({
  name: z.string().min(1).default("origin"),
  url: z.string().min(1),
});

const remoteRemoveArgsSchema = z.object({
  name: z.string().min(1),
});

const pushArgsSchema = z.object({
  remote: z.string().min(1).default("origin"),
  branch: z.string().optional(),
  setUpstream: z.boolean().default(false),
  force: z.boolean().default(false),
});

const pullArgsSchema = z.object({
  remote: z.string().min(1).default("origin"),
  branch: z.string().optional(),
  rebase: z.boolean().default(false),
});

const fetchArgsSchema = z.object({
  remote: z.string().min(1).default("origin"),
  prune: z.boolean().default(false),
});

interface ParsedDiffChange {
  type?: string;
  content?: string;
}

interface ParsedDiffChunk {
  changes?: ParsedDiffChange[];
}

interface ParsedDiffFile {
  from?: string;
  to?: string;
  chunks?: ParsedDiffChunk[];
}

export interface CommitDiffAnalysis {
  filesChanged: number;
  additions: number;
  deletions: number;
  touchesTests: boolean;
  touchesDocs: boolean;
  touchesConfig: boolean;
  topScopes: string[];
  fileExtensions: string[];
}

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
        properties: { limit: { type: "number", minimum: 1, maximum: 200 } },
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
        properties: { limit: { type: "number", minimum: 1, maximum: 200 } },
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
    git_branch_delete: {
      schema: branchDeleteArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          force: { type: "boolean" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = branchDeleteArgsSchema.parse(args);
        return deleteBranch(cwd, parsed.name, parsed.force);
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
    git_remote_list: {
      schema: z.object({}),
      jsonSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => listRemotes(cwd),
    },
    git_remote_set: {
      schema: remoteSetArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          url: { type: "string" },
        },
        required: ["url"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = remoteSetArgsSchema.parse(args);
        return setRemote(cwd, parsed.name, parsed.url);
      },
    },
    git_remote_remove: {
      schema: remoteRemoveArgsSchema,
      jsonSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = remoteRemoveArgsSchema.parse(args);
        return removeRemote(cwd, parsed.name);
      },
    },
    git_push: {
      schema: pushArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          remote: { type: "string" },
          branch: { type: "string" },
          setUpstream: { type: "boolean" },
          force: { type: "boolean" },
        },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = pushArgsSchema.parse(args);
        return push(
          cwd,
          parsed.remote,
          parsed.branch,
          parsed.setUpstream,
          parsed.force,
        );
      },
    },
    git_pull: {
      schema: pullArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          remote: { type: "string" },
          branch: { type: "string" },
          rebase: { type: "boolean" },
        },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = pullArgsSchema.parse(args);
        return pull(cwd, parsed.remote, parsed.branch, parsed.rebase);
      },
    },
    git_fetch: {
      schema: fetchArgsSchema,
      jsonSchema: {
        type: "object",
        properties: {
          remote: { type: "string" },
          prune: { type: "boolean" },
        },
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        const parsed = fetchArgsSchema.parse(args);
        return fetch(cwd, parsed.remote, parsed.prune);
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
  const analysis = analyzeDiff(diffOutput);
  const diffKeywords = extractCommitKeywords(diffOutput);
  const analysisKeywords = analysis.topScopes.flatMap((scope) =>
    tokenize(scope.replace(/\//g, " ")),
  );
  const keywords = dedupe([
    ...diffKeywords,
    ...analysisKeywords,
    ...analysis.fileExtensions,
    ...(analysis.touchesTests ? ["tests"] : []),
    ...(analysis.touchesDocs ? ["docs"] : []),
    ...(analysis.touchesConfig ? ["config"] : []),
  ]).slice(0, 40);

  return {
    branch: status.branch,
    files,
    commitStyle: config.commitStyle,
    keywords,
    analysis,
    note: "Use this context to synthesize a commit message; do not rely on tool-side heuristics.",
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
  const output = await runGit(cwd, ["commit", "-m", message]);
  return { message, output };
}

export async function createBranch(
  cwd: string,
  name: string,
  checkoutNew: boolean,
) {
  const exists = await localBranchExists(cwd, name);
  if (exists) {
    return {
      name,
      checkout: checkoutNew,
      existed: true,
      output: `Branch '${name}' already exists.`,
    };
  }

  const output = checkoutNew
    ? await runGit(cwd, ["checkout", "-b", name])
    : await runGit(cwd, ["branch", name]);
  return { name, checkout: checkoutNew, existed: false, output };
}

export async function checkout(cwd: string, target: string) {
  const output = await runGit(cwd, ["checkout", target]);
  return { target, output };
}

export async function deleteBranch(cwd: string, name: string, force: boolean) {
  const exists = await localBranchExists(cwd, name);
  if (!exists) {
    return {
      name,
      force,
      deleted: false,
      output: `Branch '${name}' does not exist.`,
    };
  }

  const output = await runGit(cwd, ["branch", force ? "-D" : "-d", name]);
  return { name, force, deleted: true, output };
}

export async function merge(cwd: string, source: string) {
  const output = await runGit(cwd, ["merge", source]);
  return { source, output };
}

export async function listRemotes(cwd: string) {
  const output = await runGit(cwd, ["remote", "-v"]);
  const seen = new Set<string>();
  const remotes: Array<{ name: string; url: string }> = [];
  for (const line of output.split("\n").filter(Boolean)) {
    const [name, url] = line.split(/\s+/);
    if (name && url && !seen.has(name)) {
      seen.add(name);
      remotes.push({ name, url });
    }
  }
  return { remotes };
}

export async function setRemote(cwd: string, name: string, url: string) {
  const existing = await listRemotes(cwd);
  const exists = existing.remotes.some((r) => r.name === name);
  const output = exists
    ? await runGit(cwd, ["remote", "set-url", name, url])
    : await runGit(cwd, ["remote", "add", name, url]);
  return { name, url, action: exists ? "updated" : "added", output };
}

export async function removeRemote(cwd: string, name: string) {
  const output = await runGit(cwd, ["remote", "remove", name]);
  return { name, removed: true, output };
}

export async function push(
  cwd: string,
  remote: string,
  branch: string | undefined,
  setUpstream: boolean,
  force: boolean,
) {
  const args = ["push"];
  if (setUpstream) args.push("-u");
  if (force) args.push("--force-with-lease");
  args.push(remote);
  if (branch) args.push(branch);
  const output = await runGit(cwd, args);
  return { remote, branch: branch ?? null, setUpstream, force, output };
}

export async function pull(
  cwd: string,
  remote: string,
  branch: string | undefined,
  rebase: boolean,
) {
  const args = ["pull"];
  if (rebase) args.push("--rebase");
  args.push(remote);
  if (branch) args.push(branch);
  const output = await runGit(cwd, args);
  return { remote, branch: branch ?? null, rebase, output };
}

export async function fetch(cwd: string, remote: string, prune: boolean) {
  const args = ["fetch", remote];
  if (prune) args.push("--prune");
  const output = await runGit(cwd, args);
  return { remote, prune, output };
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

export function analyzeDiff(diff: string): CommitDiffAnalysis {
  const parsed = parseDiff(diff) as unknown as ParsedDiffFile[];
  let additions = 0;
  let deletions = 0;
  const scopes = new Map<string, number>();
  const extensions = new Set<string>();
  let touchesTests = false;
  let touchesDocs = false;
  let touchesConfig = false;

  for (const file of parsed) {
    const currentPath = normalizedPath(file.to || file.from || "");
    if (!currentPath) {
      continue;
    }

    const lowerPath = currentPath.toLowerCase();

    if (
      lowerPath.includes("/test") ||
      lowerPath.includes("/spec") ||
      lowerPath.endsWith(".test.ts") ||
      lowerPath.endsWith(".spec.ts")
    ) {
      touchesTests = true;
    }

    if (lowerPath.startsWith("docs/") || lowerPath.endsWith(".md")) {
      touchesDocs = true;
    }

    if (
      lowerPath.endsWith(".json") ||
      lowerPath.includes("tsconfig") ||
      lowerPath.includes("eslint") ||
      lowerPath.includes("prettier") ||
      lowerPath.endsWith(".yaml") ||
      lowerPath.endsWith(".yml")
    ) {
      touchesConfig = true;
    }

    const ext = extensionToken(currentPath);
    if (ext) {
      extensions.add(ext);
    }

    const scope = pathScope(currentPath);
    scopes.set(scope, (scopes.get(scope) ?? 0) + 1);

    for (const chunk of file.chunks ?? []) {
      for (const change of chunk.changes ?? []) {
        if (change.type === "add") {
          additions += 1;
        }
        if (change.type === "del") {
          deletions += 1;
        }
      }
    }
  }

  const topScopes = [...scopes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([scope]) => scope);

  return {
    filesChanged: parsed.length,
    additions,
    deletions,
    touchesTests,
    touchesDocs,
    touchesConfig,
    topScopes,
    fileExtensions: [...extensions].slice(0, 6),
  };
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

function normalizedPath(input: string): string {
  return input.replace(/^a\//, "").replace(/^b\//, "").trim();
}

function pathScope(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0] || "root";
}

function extensionToken(filePath: string): string | null {
  const ext = filePath.split(".").at(-1)?.toLowerCase();
  if (!ext || ext === filePath.toLowerCase()) {
    return null;
  }

  return ext.length >= 2 ? ext : null;
}

async function localBranchExists(
  cwd: string,
  branchName: string,
): Promise<boolean> {
  try {
    await runGit(cwd, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ]);
    return true;
  } catch {
    return false;
  }
}
