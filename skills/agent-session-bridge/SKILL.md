---
name: agent-session-bridge
description: Use when transferring local coding-agent context between Codex, Claude, Cursor, Qoder, or QoderCLI, especially when another agent should continue work from the current directory without pasting a long transcript.
---

# Agent Session Bridge

Use the local `agent-session-bridge` CLI as a thin backend. Prefer generating files over pasting raw transcript into the live conversation.

## Workflow

1. Infer source and target agents from the user's request.
2. Prefer the current directory's matching session unless the user gives an explicit session path.
3. Generate a handoff bundle first, and prefer `--json` so the caller gets stable file paths.
4. Return the generated file paths and tell the next agent to read the `.start.txt` and `.md`.
5. Use experimental `codex-session` export only when the user explicitly wants `codex resume`.

## Commands

Use the shortest command that fits:

```bash
agent-session-bridge x2r --json
agent-session-bridge r2x --json
agent-session-bridge c2x --json
agent-session-bridge q2x --json
agent-session-bridge --agent c --session /path/to/session.jsonl --export codex-session --json
```

## Defaults

- `x2r`, `r2x`, `c2x`, and `q2x` are the built-in shortcut aliases.
- `agent-session-bridge <source> <target>` is supported.
- Default output is a two-file handoff bundle:
  - `agent-handoff-*.md`
  - `agent-handoff-*.start.txt`
- `--copy` copies the startup prompt, not the transcript.
- `--json` returns stable metadata such as `sessionId`, `sessionPath`, `outputPath`, and `promptPath`, not the full transcript body.

## When To Use Codex Resume Export

Use `--export codex-session` only when:

- source is `claude`
- the user explicitly wants a Codex-resumable session file
- it is acceptable that only visible transcript history is transferred

Do not imply hidden runtime state, tool call state, or reasoning state is preserved.
