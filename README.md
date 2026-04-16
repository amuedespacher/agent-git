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
npm run build
```

Run the app from inside any repository:

```bash
npm start
```

During development:

```bash
npm run dev
```

## Commands

- `/help` shows available chat patterns and slash commands
- `/settings` opens the settings panel
- `/chat` returns to the chat panel
- `/refresh` refreshes repository state

When a guarded tool is pending, answer with `y` or `n`.

## Configuration

Configuration is loaded with `cosmiconfig` from `git-agent.config.json`, `git-agent.config.cjs`, or the `git-agent` key in `package.json`.

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
