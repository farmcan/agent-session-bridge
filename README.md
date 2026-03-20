# agent-session-bridge

Move local coding-agent context between `Codex`, `Claude`, `Cursor`, and `Qoder` without re-explaining the task.

`agent-session-bridge` reads local session data, prefers the session for the current directory, and writes a handoff bundle or an experimental Codex-resumable session file.

## Why

This project comes from a very specific multi-agent workflow:

- one agent is already deep in a task, but another agent should continue from the same context
- one long session actually contains multiple independent tasks and should be split into separate work lines
- a new idea appears while the current session is still running, and the cleanest move is to fork a new session instead of polluting the current one

Those are the three primitives this project is aiming at:

1. `handoff`: move context from one agent to another
2. `split`: break one session into multiple task-specific sessions
3. `fork`: branch a new session from the current context when a new idea appears

Today, the implemented path is mostly `handoff`, plus an experimental `claude -> codex resume` export.
`split` and `fork` are intentional product directions, not random future ideas.

`split` also has a direct token benefit: once a long mixed session is broken into smaller work lines, each follow-up run carries less irrelevant history, which means less context bloat and lower token usage.

## Support Matrix

- `codex` -> tested against real local sessions
- `claude` -> tested against real local sessions
- `cursor` -> tested against real local sessions
- `qoder` -> tested against real local sessions
- `qodercli` -> supported as an alias of `qoder`
- `augment` / `agment` -> not implemented yet

## Install

```bash
npm install
npm link
```

Then use the global command:

```bash
agent-session-bridge
```

## Quick Start

Shortest paths:

```bash
agent-session-bridge x2r
agent-session-bridge --agent x --session-id 019d0af3-a9bd-79c0-9bd6-7693a84a0442 --stdout
agent-session-bridge x2r --json
agent-session-bridge c2x --export codex-session
agent-session-bridge c x --split-recent 1 --copy
```

## Example

Input:

```text
~/.codex/sessions/2026/03/19/rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.jsonl
```

Output:

```md
# Agent Session Handoff

Source Agent: codex
Target Agent: cursor
Session ID: 019d0592-84fc-7650-b1a2-37bd7d7ac211
Working Directory: /path/to/project
Conversation Title: ...

## Suggested Next Step

Start by checking the latest user request...

## Transcript

[user] Please add a dark mode toggle.

[assistant] I found the settings panel and will add the toggle there.
```

## Usage

```bash
agent-session-bridge x2r
agent-session-bridge r2x
agent-session-bridge c2x
agent-session-bridge --agent x --session-id 019d0af3-a9bd-79c0-9bd6-7693a84a0442 --stdout
agent-session-bridge x2r --json
agent-session-bridge x r --stdout
agent-session-bridge c x --copy
agent-session-bridge c x --split-recent 1 --out ./idea-handoff.md
agent-session-bridge --agent qoder --session ~/.qoder/projects/.../session.jsonl --stdout
agent-session-bridge --agent cursor --session ~/.cursor/projects/.../agent-transcripts/...jsonl --stdout
agent-session-bridge c2x --export codex-session
agent-session-bridge --copy
agent-session-bridge --cursor
agent-session-bridge --out ./handoff.md
```

Useful automation flags:

- `--session-id <id>`: resolve a session directly when you already have the id
- `--json`: print machine-readable metadata for generated files or stdout content
- `--root <dir>`: override the default session root when testing or scripting

By default, the CLI does not just pick the global latest session. It first tries to find the newest session for your current working directory, then falls back to the latest session for that agent if nothing matches.

Directory matching rules:

- `codex`: match `session_meta.payload.cwd`
- `claude`: match `cwd` from project transcript entries
- `qoder` / `qodercli`: match `working_dir`
- `cursor`: match the Cursor project derived from the current directory

## Two-Stage Handoff

The default file output now creates two files:

- `agent-handoff-<session>.md`: the full handoff with summary, metadata, suggested next step, and transcript
- `agent-handoff-<session>.start.txt`: a short startup prompt for the next agent

This is the recommended workflow:

1. Generate the files locally
2. Give the new agent the `.start.txt`
3. Let the new agent read the `.md` file itself instead of pasting the whole transcript into context

When you pass `--copy`, the CLI copies the startup prompt, not the raw transcript.

Built-in route aliases:

- `x2r`: `codex -> cursor`
- `r2x`: `cursor -> codex`
- `q2x`: `qoder -> codex`
- `x2q`: `codex -> qoder`
- `c2x`: `claude -> codex`
- `x2c`: `codex -> claude`
- `c2r`: `claude -> cursor`
- `r2c`: `cursor -> claude`
- `q2r`: `qoder -> cursor`
- `r2q`: `cursor -> qoder`

Agent shorthands:

- `x`: `codex`
- `c`: `claude`
- `r`: `cursor`
- `q`: `qoder`

If you still want shell aliases, add these to `~/.zshrc`:

```bash
alias x2r='agent-session-bridge x2r --copy'
alias r2x='agent-session-bridge r2x --copy'
alias q2x='agent-session-bridge q2x --copy'
alias c2x='agent-session-bridge c2x --copy'
```

Reload your shell:

```bash
source ~/.zshrc
```

Then you can run the shell aliases directly:

```bash
x2r
r2x
q2x
c2x
```

To verify that `x2r` is really working, run a stdout-only version first:

```bash
alias x2r='agent-session-bridge x2r --stdout'
x2r | sed -n '1,12p'
```

If the alias is working, you should see output like:

```text
# Agent Session Handoff

Source Agent: codex
Target Agent: cursor
Session ID: ...
Source File: ~/.codex/sessions/...
```

Then switch back to the clipboard version:

```bash
alias x2r='agent-session-bridge x2r --copy'
```

## Split A Session

Use `split` when one long session has drifted into multiple tasks, or when a new idea appears mid-run and should become its own smaller thread.

The current implementation is intentionally simple: `--split-recent N` keeps the most recent `N` real user turns and everything after them.
It also drops interruption placeholders such as `[Request interrupted by user]`.

```bash
agent-session-bridge c x --split-recent 1 --out ./idea-handoff.md
agent-session-bridge x r --split-recent 2 --copy
```

This is the first step toward `fork`. It already helps in practice because the next agent sees a smaller context window, carries less irrelevant history, and spends fewer tokens.

## Fork A Session

Use `fork` when you are still in the middle of one thread, but a new idea should become a separate next step instead of polluting the current session.

The first implementation is mechanical on purpose:

- keep the current session context
- optionally trim it first with `--split-recent`
- append one new user idea with `--fork`
- generate a fresh handoff bundle for the new branch

```bash
agent-session-bridge --agent x --fork "另外开一条线，研究 session split 的设计" --copy
printf '把这条新想法拆出去，单独研究 prompt 和 fork-file 的体验\n' > ./fork.txt
agent-session-bridge --agent x --fork-file ./fork.txt --copy
agent-session-bridge c x --split-recent 1 --fork "把这个新 idea 单独拉出来，做成 fork" --out ./fork-handoff.md
```

This is useful for both workflow and token control: the new branch keeps only the context you actually want, and the next run does not have to drag the whole overloaded session forward.

`--fork` and `--fork-file` are intentionally mutually exclusive.

The default command writes a file like:

```text
./agent-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.md
./agent-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.start.txt
```

## Experimental Codex Resume Export

There is now an experimental export path for `claude -> codex resume`.

```bash
agent-session-bridge claude codex --export codex-session
agent-session-bridge --agent claude --session ~/.claude/projects/.../session.jsonl --export codex-session
```

This writes a Codex-shaped `jsonl` session file that you can place under `~/.codex/sessions/...` and resume with `codex resume <session-id>`.

Current scope:

- implemented for `claude`
- emits `session_meta` plus `response_item` user/assistant messages
- intentionally does not try to recreate tool calls, reasoning, or hidden runtime state

This is experimental on purpose. The regular handoff bundle is still the default workflow.

## Product Direction

The real product shape is not just "export a transcript".

It is a local session workflow layer for coding agents:

- `handoff`: agent A -> agent B
- `split`: one overloaded session -> multiple cleaner sessions
- `fork`: current session -> new branch for a fresh idea

If you also work with multiple agents in parallel, these are usually the real missing controls.
The current repository already covers the first one. The other two are part of the intended design space.
And among them, `split` is also the most obvious context-compression primitive: it reduces noise, narrows the active task, and saves tokens for the next run.

## Use As A Skill

There is also a thin skill wrapper in [skills/agent-session-bridge/SKILL.md](/Users/levi/wrksp/agent-session-bridge/skills/agent-session-bridge/SKILL.md).

The intended split is:

- CLI: the stable backend
- skill: the agent-facing wrapper that decides which command to run

The skill should generate files and return paths. It should not paste long transcript content into the live conversation unless the user explicitly asks for it.

## How It Works

- Finds the most relevant session for the selected agent based on your current directory
- Parses the local `jsonl` session log with an agent-specific adapter
- Pulls extra metadata when available
- `Qoder` / `QoderCLI`: also reads the sidecar `*-session.json` for title, working directory, and update time
- Normalizes messages into one shared transcript format
- Produces a Markdown handoff file plus a startup prompt for the target agent
- Can also export an experimental Codex-resumable session from Claude transcripts

## Verification

```bash
npm test
```

Expected result:

- `node --test` passes

Real smoke tests I used on this machine:

```bash
agent-session-bridge x2r --session "$(find ~/.codex/sessions -type f -name '*.jsonl' | sort | tail -n 1)" --out /tmp/codex-to-cursor.md
agent-session-bridge --agent x --session-id 019d0af3-a9bd-79c0-9bd6-7693a84a0442 --stdout
agent-session-bridge x2r --json
agent-session-bridge c x --session "$(find ~/.claude/projects -type f -name '*.jsonl' | sort | tail -n 1)" --split-recent 1 --fork "把这个新 idea 单独拉出来，做成 fork" --out /tmp/claude-fork.md
agent-session-bridge c2x --session "$(find ~/.claude/projects -type f -name '*.jsonl' | sort | tail -n 1)" --export codex-session --out /tmp/claude-to-codex.jsonl
printf '把这条新想法拆出去，单独研究 prompt 和 fork-file 的体验\n' > /tmp/fork.txt
agent-session-bridge --agent x --session "$(find ~/.codex/sessions -type f -name '*.jsonl' | sort | tail -n 1)" --fork-file /tmp/fork.txt --out /tmp/fork-file.md
```

What to check:

- handoff mode writes two files: `*.md` and `*.start.txt`
- `--copy` copies the `*.start.txt` content, not the raw transcript
- `--session-id` should resolve the same session without needing a full file path
- `--json` should print stable metadata fields like `sessionId`, `sessionPath`, `outputPath`, and `promptPath`
- Codex handoff should start from the real task, not `AGENTS.md` bootstrap noise
- `--split-recent 1` should keep only the most recent real user turn
- `--fork` and `--fork-file` should make the new idea become the last user request
- `--export codex-session` should write `session_meta` plus `response_item` rows

## Roadmap

- Support more agent formats beyond the current adapter set
- Add session `split` workflows for breaking one transcript into multiple work lines
- Add session `fork` workflows for branching a new session from current context
- Improve transcript summarization for long sessions
- Offer richer target-specific startup prompts

## License

MIT
