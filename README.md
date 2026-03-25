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

## Practical Test

The most convincing way to validate `kage` is to resume a real session in one agent, export it, then resume it in another.

For example, start from a Claude session:

```text
Resume this session with:
claude --resume b3b958d7-4ac8-41c4-8660-7b7f654737c6
```

Then run:

```bash
kage c2x
```

If multiple Claude sessions match the current directory, `kage` will ask you to choose:

```text
Multiple Claude sessions match the current directory:
1. a=100,b=200,a+b=?
   2026-03-22T14:49:54.695Z  b3b958d7-4ac8-41c4-8660-7b7f654737c6
   /Users/you/.claude/projects/-Users-you-wrksp-agentkit/b3b958d7-4ac8-41c4-8660-7b7f654737c6.jsonl
2. a=1,b=2,a+b=?
   2026-03-22T14:49:13.552Z  a3ac68c7-76f4-44ef-a619-f04f19b49c83
   /Users/you/.claude/projects/-Users-you-wrksp-agentkit/a3ac68c7-76f4-44ef-a619-f04f19b49c83.jsonl
3. 查看并了解当前代码
   2026-03-20T13:26:27.783Z  33d6decd-7776-4fba-b1d6-50b904c07010
   /Users/you/.claude/projects/-Users-you-wrksp-agentkit/33d6decd-7776-4fba-b1d6-50b904c07010.jsonl
Select a session [1-3]: 1
/Users/you/.codex/sessions/2026/03/22/rollout-2026-03-22T14-49-54-695Z-b3b958d7-4ac8-41c4-8660-7b7f654737c6.jsonl
Run:
codex resume b3b958d7-4ac8-41c4-8660-7b7f654737c6
```

Finally, resume it in Codex:

```bash
codex resume b3b958d7-4ac8-41c4-8660-7b7f654737c6
```

If the export worked, Codex opens in the same project directory and continues from the imported context.

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

If you mistype a route alias such as `q2q`, `kage` reports the unknown alias and prints the supported alias list.

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
- chooser titles prefer the first real user prompt instead of bootstrap metadata like Codex environment context
- chooser titles and paths stay untruncated so similar sessions remain distinguishable
- non-interactive runs fail clearly and ask for `--session-id`
- malformed JSONL rows are ignored during session discovery so one corrupted transcript does not block the whole scan

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
