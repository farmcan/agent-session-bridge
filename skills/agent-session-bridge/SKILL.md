---
name: agent-session-bridge
description: Use when transferring local coding-agent context between Codex, Claude, Cursor, Qoder, or QoderCLI, especially when another agent should continue work from the current directory without pasting a long transcript.
---

# Agent Session Bridge

Use the local `agent-session-bridge` CLI as a thin backend. Prefer generating files over pasting raw transcript into the live conversation.

## Workflow

1. Infer source and target agents from the user's request.
2. Prefer the current directory's matching session unless the user gives an explicit session path.
3. Generate a handoff bundle first.
4. Return the generated file paths and tell the next agent to read the `.start.txt` and `.md`.
5. Use experimental `codex-session` export only when the user explicitly wants `codex resume`.

## Commands

Use the shortest command that fits:

```bash
agent-session-bridge c2r
agent-session-bridge codex cursor --copy
agent-session-bridge claude codex --stdout
agent-session-bridge --agent claude --session /path/to/session.jsonl --export codex-session
```

## Defaults

- `c2r`, `r2c`, `q2c`, `c2q`, `cl2c`, `c2cl` are built-in route aliases.
- `agent-session-bridge <source> <target>` is supported.
- Default output is a two-file handoff bundle:
  - `agent-handoff-*.md`
  - `agent-handoff-*.start.txt`
- `--copy` copies the startup prompt, not the transcript.

## When To Use Codex Resume Export

Use `--export codex-session` only when:

- source is `claude`
- the user explicitly wants a Codex-resumable session file
- it is acceptable that only visible transcript history is transferred

Do not imply hidden runtime state, tool call state, or reasoning state is preserved.
