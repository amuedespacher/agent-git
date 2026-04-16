# git-agent

`git-agent` is a terminal-native Git assistant with a chat-first workflow, a tool-driven agent loop, and a safety layer around local Git operations.

## What v1 includes

- Ink-based terminal UI with chat transcript, repo sidebar, and approval prompts
- Tool-driven runtime with safe/read tools and guarded/write tools
- Heuristic local planner that works without model credentials
- Optional OpenAI-backed provider with tool calling
- Branch naming validation and commit-style configuration
- Commit message suggestion from staged changes
- Basic decision support for dirty trees and diverged branches

## Install

```bash
npm install
npm run install:cli
```

This links the local package onto your shell `PATH` so the `git-agent` command works directly.

Run the app from inside any repository:

```bash
git-agent
```

If you prefer not to link a global command, run it directly from the project:

```bash
npm start
```

During development:

```bash
npm run dev
```

## Commands

- `git-agent --help` shows CLI usage
- `git-agent --version` prints the installed version
- `/help` shows available chat patterns and slash commands
- `/settings` opens the settings panel
- `/chat` returns to the chat panel
- `/refresh` refreshes repository state

When a guarded tool is pending, answer with `y` or `n`.

## Configuration

Configuration is loaded with `cosmiconfig` from `git-agent.config.json`, `git-agent.config.cjs`, or the `git-agent` key in `package.json`. User-level OpenAI credentials are stored in `~/.git-agent/config.json`.

Example:

```json
{
  "provider": {
    "kind": "heuristic",
    "model": "local-heuristic"
  },
  "commitStyle": "conventional",
  "branchPattern": "^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$",
  "safetyLevel": "balanced",
  "verbosity": "normal"
}
```

To use OpenAI, set `provider.kind` to `openai` and export `OPENAI_API_KEY`.

## Suggested prompts

- `what's going on in this repo?`
- `help me commit my staged changes`
- `validate my branch name`
- `show me the staged diff`
- `show recent history`

## Testing

```bash
npm test
```
