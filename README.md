# agent-session-bridge

Export local agent sessions into native `Codex`, `Claude`, and `Qoder` session files.

The CLI reads the latest session for the current working directory, normalizes it into one internal session model, then exports it into the target agent's native format.

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
npm install
npm link
```

## Quick Start

```bash
agent-session-bridge x2c
agent-session-bridge c2x
agent-session-bridge x2x
agent-session-bridge q2x
agent-session-bridge q2c
agent-session-bridge x2q
agent-session-bridge c2q
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

## Examples

Resume a Claude conversation in Codex:

```bash
agent-session-bridge c2x
```

Resume a Codex conversation in Claude:

```bash
agent-session-bridge x2c
```

Fork the current Codex conversation into a new Codex session:

```bash
agent-session-bridge x2x
```

Export a Qoder session into Claude:

```bash
agent-session-bridge q2c
```

Export a Codex session into Qoder's session format:

```bash
agent-session-bridge x2q
```

Use explicit source and target instead of aliases:

```bash
agent-session-bridge codex claude
agent-session-bridge qoder codex
agent-session-bridge claude qoder
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
agent-session-bridge --agent claude --target codex --session ~/.claude/projects/.../session.jsonl
```

Resolve by session id:

```bash
agent-session-bridge --agent codex --target claude --session-id <session-id>
```

Write to a specific location:

```bash
agent-session-bridge x2q --out ./tmp/qoder-session.jsonl --json
```

Write using default filenames into a directory:

```bash
agent-session-bridge c2x --output-dir ./tmp/exports --json
```

Show the export body instead of writing files:

```bash
agent-session-bridge q2c --stdout
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

## Transforms

The export pipeline can trim or branch a conversation before writing it:

- `--split-recent N`: keep only the most recent `N` real user turns and everything after them
- `--fork "..."`: append one new user message before export
- `--fork-file path.txt`: read that message from a file

Examples:

```bash
agent-session-bridge claude qoder --split-recent 1 --out ./tmp/split.jsonl
agent-session-bridge claude qoder --fork "另外开一个分支，去做 session split" --out ./tmp/fork.jsonl
```

## Current Scope

- exports visible transcript history only
- does not preserve hidden reasoning, tool runtime state, or UI state
- `qoder-session` is implemented as a best-effort native export format, pending future resume support on the Qoder side
