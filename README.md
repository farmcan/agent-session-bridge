# agent-session-bridge

Export local agent sessions into native `Codex`, `Claude`, and `Qoder` session files.

The CLI reads the latest session for the current working directory, normalizes it into one internal session model, then exports it into the target agent's native format.

The CLI command is `kage`.
The name comes from the "shadow clone" idea: a useful coding agent should be able to fork its current working context into parallel branches instead of forcing every task through one linear loop.

## Why It Exists

`agent-session-bridge` is built around two practical workflows.

1. Fork a conversation and keep the useful context.
You can branch an existing session, trim it, append one new user message, and continue without rebuilding context from scratch.

2. Bridge between agents.
You can move a session between tools like `Claude -> Codex` or `Codex -> Claude` and keep working with a native session file instead of a pasted transcript.

## Core Examples

Bridge a Claude session into Codex:

```bash
agent-session-bridge c2x
```

Bridge a Codex session into Claude:

```bash
agent-session-bridge x2c
```

Fork the current Codex session into a new Codex session:

```bash
agent-session-bridge x2x
```

Fork or trim before exporting:

```bash
agent-session-bridge claude qoder --split-recent 1 --out ./tmp/split.jsonl
agent-session-bridge claude qoder --fork "另外开一个分支，去做 session split" --out ./tmp/fork.jsonl
```

## What It Supports

| Source | Target | Default Export | Resume Hint |
|---|---|---|---|
| `codex` | `claude` | `claude-session` | `claude --resume ...` |
| `claude` | `codex` | `codex-session` | `codex resume ...` |
| `codex` | `codex` | `codex-session` fork | `codex resume ...` |
| `qoder` / `qodercli` | `codex` | `codex-session` | `codex resume ...` |
| `qoder` / `qodercli` | `claude` | `claude-session` | `claude --resume ...` |
| `codex` | `qoder` / `qodercli` | `qoder-session` | not yet |
| `claude` | `qoder` / `qodercli` | `qoder-session` | not yet |

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/farmcan/agent-session-bridge/main/install.sh | bash
```

Then use:

```bash
kage c2x
```

For local development:

```bash
npm install
npm link
```

## Quick Start

```bash
kage c2x
kage x2c
kage x2x
kage q2x
kage q2c
kage x2q
kage c2q
```

## Route Aliases

| Alias | Meaning | Default Export |
|---|---|---|
| `x2x` | `codex -> codex` | `codex-session` |
| `x2c` | `codex -> claude` | `claude-session` |
| `x2q` | `codex -> qoder` | `qoder-session` |
| `c2x` | `claude -> codex` | `codex-session` |
| `c2q` | `claude -> qoder` | `qoder-session` |
| `q2x` | `qoder -> codex` | `codex-session` |
| `q2c` | `qoder -> claude` | `claude-session` |

Agent shorthands:

- `x`: `codex`
- `c`: `claude`
- `q`: `qoder`

Use explicit source and target instead of aliases:

```bash
kage codex claude
kage qoder codex
kage claude qoder
```

## Options

```text
--agent <agent>
--target <agent>
--session <path>
--session-id <id>
--out <path>
--output-dir <dir>
--export codex-session|claude-session|qoder-session
--split-recent <n>
--fork <prompt>
--fork-file <path>
--stdout
--json
--help
```

Useful patterns:

Specify a session directly:

```bash
kage --agent claude --target codex --session ~/.claude/projects/.../session.jsonl
```

Resolve by session id:

```bash
kage --agent codex --target claude --session-id <session-id>
```

Write to a specific location:

```bash
kage x2q --out ./tmp/qoder-session.jsonl --json
```

Write using default filenames into a directory:

```bash
kage c2x --output-dir ./tmp/exports --json
```

Show the export body instead of writing files:

```bash
kage q2c --stdout
```

## Session Resolution

The CLI does not blindly use the global latest session.

It first tries to find sessions for the current working directory, then falls back to the latest session for that agent if nothing matches.

If multiple matching sessions exist for the current directory:

- interactive terminals get a numbered chooser
- non-interactive runs fail clearly and ask for `--session-id`

Matching rules:

- `codex`: `session_meta.payload.cwd`
- `claude`: `cwd` from transcript rows
- `qoder` / `qodercli`: `working_dir`

## Export Behavior

`codex-session` installs directly into:

```text
~/.codex/sessions/YYYY/MM/DD/...
```

When the export is installed there, the CLI prints:

```text
Run:
codex resume <session-id>
```

`claude-session` installs directly into:

```text
~/.claude/projects/<project-key>/...
```

When the export is installed there, the CLI prints:

```text
Run:
claude --resume <session-id>
```

`qoder-session` currently exports files only:

- `<session-id>.jsonl`
- `<session-id>-session.json`

It does not print a resume command yet.

If you use `--out` or `--output-dir`, missing parent directories are created automatically.

## Forking And Trimming

The export pipeline can trim or branch a conversation before writing it:

- `--split-recent N`: keep only the most recent `N` real user turns and everything after them
- `--fork "..."`: append one new user message before export
- `--fork-file path.txt`: read that message from a file

## Current Scope

- exports visible transcript history only
- does not preserve hidden reasoning, tool runtime state, or UI state
- `qoder-session` is implemented as a best-effort native export format, pending future resume support on the Qoder side
