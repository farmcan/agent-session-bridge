# Agent Session Bridge Design

## Goal

Make it easy to move local coding-agent context between tools without manually restating the task.

## Core Model

The project does not try to migrate hidden runtime state.

It does three simpler things:

1. find the most relevant local session
2. normalize it into a shared transcript model
3. export it in a format another agent can continue from

## Session Selection

Default behavior is current-directory first, global latest second.

- `codex`: match `session_meta.payload.cwd`
- `claude`: match transcript `cwd`
- `qoder` / `qodercli`: match `working_dir`
- `cursor`: match project directory derived from the current path

## Supported Exports

### 1. Handoff bundle

Default output:

- `agent-handoff-*.md`
- `agent-handoff-*.start.txt`

This is the normal path for cross-agent continuation.

### 2. Experimental Codex resume export

Current experimental path:

- `claude -> codex`

This exports a Codex-shaped `jsonl` session using:

- `session_meta`
- `response_item` message records

It is intentionally limited to visible transcript history.

## CLI Shape

The CLI should optimize for the shortest common routes.

Preferred shorthand:

- `x` = `codex`
- `c` = `claude`
- `r` = `cursor`
- `q` = `qoder`

Examples:

```bash
agent-session-bridge x2r
agent-session-bridge x r --copy
agent-session-bridge c x --export codex-session
```

## Skill Shape

The skill should stay thin.

- CLI: stable backend
- skill: agent-facing wrapper

The skill should infer source/target, call the CLI, generate files, and return file paths. It should not duplicate parsing or storage logic.
