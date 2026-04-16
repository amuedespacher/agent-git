import { execa } from "execa";

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export async function runGit(
  cwd: string,
  args: string[],
  allowFailure = false,
): Promise<string> {
  try {
    const result = await execa("git", args, { cwd, all: false });
    return result.stdout.trimEnd();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    if (
      error instanceof Error &&
      "stderr" in error &&
      "shortMessage" in error
    ) {
      const failure = error as Error & {
        stderr?: string;
        shortMessage?: string;
      };
      throw new GitCommandError(
        failure.shortMessage ?? "Git command failed",
        `git ${args.join(" ")}`,
        failure.stderr ?? "",
      );
    }

    throw error;
  }
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const output = await runGit(
    cwd,
    ["rev-parse", "--is-inside-work-tree"],
    true,
  );
  return output.trim() === "true";
}
