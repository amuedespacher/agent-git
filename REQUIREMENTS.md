# Agent-based Git CLI – Concept Overview

## Core Idea

A terminal-native, chat-first Git assistant that operates as a **tool-driven agent**, not a command wrapper.

The user interacts via natural language in a persistent terminal UI. The agent reasons about the repository, calls structured Git tools, executes them locally, and continues iteratively until the task is complete.

The system follows a simple but powerful model:

**LLM + Tool Loop + Local Execution + Safety Layer**

---

## What This Product Is (and Is Not)

**It is:**

- A conversational Git co-pilot
- A local-first agent runtime
- A safety layer around Git operations
- A workflow enforcement tool (conventions, naming, commits)

**It is not:**

- A traditional CLI with subcommands
- A simple commit-message generator
- A remote AI service executing Git

---

## Primary User Experience

The user runs:

```
drgit
```

This opens an interactive terminal UI.

From there, everything happens inside a chat:

- Ask questions about Git state
- Request actions ("clean up my branch", "commit my changes")
- Get explanations of situations
- Review and approve actions

---

## Key Capabilities

### 1. Git Decision Support (Core Differentiator)

The agent inspects the repository and helps the user make safe decisions.

Examples:

- Dirty working tree → stash vs commit vs discard
- Diverged branch → merge vs rebase vs reset
- Conflicts → guidance and recovery
- Force push → risk explanation

The agent always:

- explains the situation
- presents options
- recommends a safe path

---

### 2. Commit Assistance

- Generate commit messages from staged changes
- Support configurable styles (e.g. conventional commits)
- Allow user editing before commit

---

### 3. Branch Naming Enforcement

- Validate branch names against templates
- Suggest correct naming
- Assist with branch creation

---

### 4. Error Recovery

- Help recover from mistakes (via reflog, restore, etc.)
- Guide user step-by-step
- Prioritize data safety

---

### 5. Configurable Agent

Users can configure:

- LLM provider and model
- commit style
- branch naming conventions
- safety level
- verbosity / explanation style

---

## Interaction Model

### Chat-first

Natural language is the primary interface.

### Agent Loop

The system runs an internal loop:

1. User input
2. LLM decides what to do
3. Tool calls are generated
4. Tools are executed locally
5. Results are fed back to the LLM
6. Loop continues

This allows multi-step reasoning (e.g. inspect → analyze → modify → verify).

---

## Tool-Based Architecture

The agent does not directly execute logic. It uses tools.

### Tool Categories

**Read tools (safe):**

- git_status
- git_diff
- git_log
- git_branch_list
- git_reflog

**Write tools (guarded):**

- git_commit
- git_branch_create
- git_checkout
- git_merge
- git_rebase
- git_reset
- git_push

**Safety tools:**

- dry_run
- create_backup_ref

All capabilities flow through these tools.

---

## Safety Model (Critical)

Git is dangerous. The product must be safe by design.

Key principles:

- Never execute destructive actions without confirmation
- Always explain consequences
- Offer backup before risky operations
- Prefer safe defaults

Risk levels:

- SAFE (read-only)
- LOW (commit, branch)
- HIGH (reset, rebase, force push)

---

## Terminal UI (TUI)

The app is a **full terminal application**, not a prompt loop.

Suggested layout:

- Header: repo, branch, model
- Sidebar: repo state (changes, branches)
- Main panel: chat + tool execution timeline
- Input: chat field

Optional:

- diff preview panel
- action approval modal

---

## Modes Inside the App

- Chat (default)
- Settings
- Review (for risky actions)

Accessible via slash commands (e.g. `/settings`).

---

## Technology Direction

- Language: TypeScript (Node.js)
- TUI: Ink
- Process execution: execa
- Validation: zod
- Config: cosmiconfig

LLM providers are abstracted (OpenAI, Anthropic, local models).

---

## MVP Scope

Start with:

- Chat-based TUI
- Basic agent loop
- Core Git tools (status, diff, commit)
- Commit message generation
- Branch validation
- Basic decision support (dirty tree, divergence)
- Confirmation system

---

## Key Insight

The product is not about generating Git commands.

It is about:

**Helping developers understand Git state, make safe decisions, and maintain clean workflows through an explainable agent.**

That is the real value and differentiation.

---

## Possible Future Extensions

- Git hooks integration
- Team policy sync
- Learning from user behavior
- IDE integration
- Multi-repo awareness

---

## Summary

This is a **terminal-native agent system where Git is the primary toolset**.

The combination of:

- chat interface
- tool-driven execution
- strong safety model

creates a product that goes beyond existing Git helpers and into a new category: **agent-assisted version control workflows**.

IMPORTANT: Read this on how to build an agent loop and tools: https://www.mihaileric.com/The-Emperor-Has-No-Clothes/
