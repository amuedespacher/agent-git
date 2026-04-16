# Dr. Git

`drgit` is a terminal-native Git assistant with a chat-first workflow, a tool-driven agent loop, and a safety layer around local Git operations.

## What v1 includes

- Ink-based terminal UI with chat transcript, repo sidebar, and approval prompts
- Tool-driven runtime with safe/read tools and guarded/write tools
- OpenAI-native provider with tool calling
- Branch naming validation and commit-style configuration
- Commit message suggestion from staged changes
- Basic decision support for dirty trees and diverged branches

## Install

```bash
npm install
npm run install:cli
```

This links the local package onto your shell `PATH` so the `drgit` command works directly.

Run the app from inside any repository:

```bash
drgit
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

- `drgit --help` shows CLI usage
- `drgit --version` prints the installed version
- `/help` shows available chat patterns and slash commands
- `/settings` opens the settings panel
- `/connect-openai` prompts for an OpenAI API key, tests it, and saves it
- `/chat` returns to the chat panel
- `/refresh` refreshes repository state

When a guarded tool is pending, answer with `y` or `n`.

## Configuration

Configuration is loaded with `cosmiconfig` from `drgit.config.json`, `drgit.config.cjs`, or the `drgit` key in `package.json`. User-level OpenAI credentials are stored in `~/.drgit/config.json`.

Example:

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

To use OpenAI from inside the app, run `/connect-openai`, paste your API key, and let the app test and save the connection for you. On first launch without a configured key, the app automatically enters OpenAI setup mode.

You can still configure OpenAI via environment variable by exporting `OPENAI_API_KEY`.

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
