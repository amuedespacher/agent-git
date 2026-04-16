# Dr. Git

> **Experimental** — This is an early-stage hobby project. Expect rough edges and breaking changes. Use with care on repositories that matter to you.

`drgit` is a terminal-native, chat-first Git assistant powered by an LLM agent loop. Instead of memorising subcommands, you describe what you want in plain language and Dr. Git reasons about your repository, calls structured Git tools, and asks for your approval before making any changes.

```
npx drgit
```

Run that inside any Git repository to open the interactive UI.

---

## How it works

Dr. Git connects to an OpenAI model and drives an internal agent loop:

1. You send a natural-language message.
2. The LLM decides which Git tools to call.
3. Tools are executed **locally** against your repository.
4. Results feed back into the model until the task is complete.

Write operations (commit, push, branch changes, etc.) are **guarded** — the agent presents the action and waits for your explicit `y` or `n` before executing anything.

---

## Requirements

- Node.js ≥ 18
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A Git repository to work in

---

## Setup

### Via npx (no install)

```bash
npx drgit
```

On first launch without a saved key, the app will walk you through connecting to OpenAI.

### Global install

```bash
npm install -g drgit
drgit
```

---

## What you can ask

**Repository inspection**

- `what's going on in this repo?`
- `show me the staged diff`
- `show recent commit history`
- `list all branches`
- `what remotes are configured?`

**Committing**

- `help me commit my staged changes`
- `stage everything and write a commit message`
- `suggest a conventional commit message for my diff`

**Branching**

- `create a branch called feature/my-thing`
- `switch to main`
- `delete the branch fix/old-thing`
- `validate my current branch name`

**Syncing with remotes**

- `push my branch`
- `pull the latest from origin`
- `fetch and prune stale remote branches`

**Remote management**

- `add a remote called upstream`
- `change the origin URL`

---

## Slash commands

| Command           | Description                                     |
| ----------------- | ----------------------------------------------- |
| `/help`           | Show available chat patterns and slash commands |
| `/settings`       | Open the settings panel                         |
| `/connect-openai` | Enter and save your OpenAI API key              |
| `/chat`           | Return to the chat panel                        |
| `/refresh`        | Re-scan repository state                        |
| `drgit --help`    | CLI flag reference                              |
| `drgit --version` | Print the installed version                     |

---

## Configuration

Configuration is resolved via [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig): place a `drgit.config.json` file in your project root, or add a `"drgit"` key to `package.json`. Your OpenAI credentials are stored separately in `~/.drgit/config.json`.

```json
{
  "provider": {
    "kind": "openai",
    "model": "gpt-4.1-mini"
  },
  "commitStyle": "conventional",
  "branchPattern": "^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$",
  "safetyLevel": "balanced",
  "verbosity": "normal"
}
```

You can also supply the API key via environment variable instead of the interactive setup:

```bash
export OPENAI_API_KEY=sk-...
```

---

## Limitations

Dr. Git is experimental. The following are known gaps in the current implementation:

- **OpenAI only.** No support for other providers (Anthropic, Ollama, local models). An API key is required — there is no offline or heuristic-only mode.
- **No rebase tool.** Interactive or standalone rebase is not implemented. Pull with `--rebase` is supported, but the agent cannot drive a rebase workflow step-by-step.
- **No reset tool.** `git reset` (soft, mixed, or hard) is not available as an agent action. Recovery from bad commits must be done manually.
- **No stash tool.** The agent cannot stash or pop changes. It may suggest stashing, but cannot execute it.
- **No conflict resolution.** The agent cannot walk you through resolving merge conflicts. It can detect conflicted files in the status but cannot act on them.
- **Diff and log size limits.** Diffs are capped at 400 lines and logs at 200 entries. Very large changesets may be truncated before the model sees them.
- **Single repository.** The agent operates only in the directory it was launched from. Monorepo or multi-root scenarios are not supported.
- **macOS/Linux only.** Untested on Windows. The terminal UI may not render correctly in all Windows terminals.

---

## Development

```bash
git clone https://github.com/amuedespacher/drgit.git
cd drgit
npm install
npm run dev        # run from source with tsx
npm test           # run the test suite
npm run build      # compile TypeScript to dist/
```
