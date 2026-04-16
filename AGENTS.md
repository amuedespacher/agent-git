# Dr. Git — Agent Guidelines

## Project overview

Terminal-native, chat-first Git assistant. The user types natural language; an LLM agent loop calls structured Git tools locally; write operations require explicit user approval. Built with TypeScript, Ink (React for terminals), and the OpenAI API.

## Build and test

```bash
npm run build   # tsc → dist/
npm test        # vitest run
npm run dev     # run from source with tsx (no build required)
```

Always run `npm test` after changes to `src/git/`, `src/agent/`, or `src/config/`.

## Architecture

```
src/
  index.tsx            # CLI entry point, shebang, --help/--version flags
  types.ts             # All shared types — add new types here, not inline
  agent/
    provider.ts        # AgentProvider interface — the only abstraction over LLMs
    openaiProvider.ts  # Concrete OpenAI implementation
    runtime.ts         # AgentRuntime — owns the agent loop, state, and listeners
  config/
    index.ts           # cosmiconfig loader + zod schema; user config at ~/.drgit/
  git/
    exec.ts            # Raw git process execution (execa)
    tools.ts           # All Git tools exposed to the agent; add new tools here
    policy.ts          # Branch name validation logic
  ui/
    App.tsx            # Ink root component; reads RuntimeSnapshot, no direct state
```

The `AgentRuntime` is the single source of truth. The UI is a pure subscriber — it never mutates runtime state directly.

## Conventions

- **ESM only** — `"type": "module"` in package.json. All imports must use `.js` extensions (even for `.ts` source files), per `moduleResolution: NodeNext`.
- **Zod at all boundaries** — every tool's input is validated with a zod schema defined alongside the tool in `tools.ts`. Do not skip validation even for "safe" read tools.
- **Risk levels matter** — tools are either `safe` (read-only, execute freely) or `guarded` (write, require `PendingApproval` flow). Any new tool that mutates git state must be guarded.
- **No direct git execution outside `exec.ts`** — all `git` subprocess calls go through `runGit()` in `src/git/exec.ts`.
- **Types live in `types.ts`** — do not define interfaces inline in component or module files.

## Key constraints

- OpenAI is the only supported provider. Do not add multi-provider abstractions without discussion.
- `git rebase`, `git reset`, and `git stash` are **not implemented** as agent tools. Do not add them without also adding the corresponding approval/safety handling.
- Config module name for cosmiconfig is `"drgit"`. Do not rename.
- User credentials live in `~/.drgit/config.json` — never log or expose the API key.
