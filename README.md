# agent-session-bridge

Move local coding-agent context between `Codex`, `Claude`, `Cursor`, and `Qoder` without re-explaining the task.

`agent-session-bridge` reads local session data, prefers the session for the current directory, normalizes it into one internal session model, and then exports either:

- a native resumable session for the target agent
- a native session file for a target that does not support resume yet
- a fallback handoff bundle

## Support Matrix

| Source | Target | Default Output | Resume Hint |
|---|---|---|---|
| `codex` | `claude` | `claude-session` | `claude --resume ...` |
| `claude` | `codex` | `codex-session` | `codex resume ...` |
| `codex` | `codex` | `codex-session` fork | `codex resume ...` |
| `qoder` / `qodercli` | `codex` | `codex-session` | `codex resume ...` |
| `qoder` / `qodercli` | `claude` | `claude-session` | `claude --resume ...` |
| `codex` | `qoder` / `qodercli` | `qoder-session` | not yet |
| `claude` | `qoder` / `qodercli` | `qoder-session` | not yet |
| others | others | handoff | n/a |

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

Run one of these first:

```bash
agent-session-bridge x2c
agent-session-bridge c2x
agent-session-bridge q2x
agent-session-bridge q2c
agent-session-bridge x2q
agent-session-bridge x2r
agent-session-bridge x2r --json
```

## Real Example

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

Output:

```md
# Agent Session Handoff

Source Agent: x
Target Agent: r
Session ID: ...
Working Directory: /path/to/project

## Suggested Next Step

Start by checking the latest user request...
```

## Usage

```bash
agent-session-bridge x2c
agent-session-bridge c2x
agent-session-bridge x2x
agent-session-bridge q2x
agent-session-bridge q2c
agent-session-bridge x2q
agent-session-bridge c2q
agent-session-bridge x2r
agent-session-bridge r2x
agent-session-bridge --agent x --session-id 019d0af3-a9bd-79c0-9bd6-7693a84a0442 --stdout
agent-session-bridge x2r --json
agent-session-bridge x2r --output-dir ./tmp/bridge-out --json
agent-session-bridge x2c --handoff
agent-session-bridge c2x --handoff
agent-session-bridge c x --split-recent 1 --out ./idea-handoff.md
agent-session-bridge c x --split-recent 1 --fork "把这个新 idea 单独拉出来" --out ./fork-handoff.md
```

Useful automation flags:

- `--session-id <id>`: resolve a session directly when you already have the id
- `--json`: print machine-readable metadata for generated files or stdout mode
- `--root <dir>`: override the default session root when testing or scripting
- `--output-dir <dir>`: keep the default generated file names, but write them into a different directory

If you do not pass `--out` or `--output-dir`, regular handoff files go under:

```text
./tmp/agent-session-bridge/
```

Primary route aliases now default to native export:

- `x2c`: install a Claude session under `~/.claude/projects/...` and print `claude --resume <session-id>`
- `c2x`: install a Codex session under `~/.codex/sessions/YYYY/MM/DD/...` and print `codex resume <session-id>`
- `x2x`: create a new Codex fork session and print `codex resume <session-id>`
- `q2x`: install a Codex session and print `codex resume <session-id>`
- `q2c`: install a Claude session and print `claude --resume <session-id>`
- `x2q` / `c2q`: export a `qoder-session` bundle under `./tmp/agent-session-bridge/` by default, without a resume hint yet

Use `--handoff` if you explicitly want the old `.md + .start.txt` bundle instead.

The CLI creates missing parent directories automatically for both `--output-dir` and `--out`.

By default, the CLI does not just pick the global latest session. It first tries to find sessions for your current working directory, then falls back to the latest session for that agent if nothing matches.

Claude, Codex, and Qoder/QoderCLI all follow the same ambiguity rule:

- if exactly one matching session matches the current directory, the CLI uses it automatically
- if multiple matching sessions exist and you are in an interactive terminal, the CLI asks you to choose and shows a short title, timestamp, session id, and full session path
- if multiple matching sessions exist in non-interactive mode, the CLI fails clearly and tells you to use `--session-id`

Directory matching rules:

- `codex`: match `session_meta.payload.cwd`
- `claude`: match `cwd` from project transcript entries
- `qoder` / `qodercli`: match `working_dir`
- `cursor`: match the Cursor project derived from the current directory

## Handoff Bundle

The default file output now creates two files:

- `agent-handoff-<session>.md`: the full handoff with summary, metadata, suggested next step, and transcript
- `agent-handoff-<session>.start.txt`: a short startup prompt for the next agent

This is the recommended workflow:

1. Generate the files locally
2. Give the new agent the `.start.txt`
3. Let the new agent read the `.md` file itself instead of pasting the whole transcript into context

When you pass `--copy`, the CLI copies the startup prompt, not the raw transcript.

Built-in shortcut aliases:

- `x2x`: `codex -> codex`
- `x2c`: `codex -> claude`
- `x2q`: `codex -> qoder`
- `x2r`: `codex -> cursor`
- `c2q`: `claude -> qoder`
- `c2r`: `claude -> cursor`
- `r2x`: `cursor -> codex`
- `r2c`: `cursor -> claude`
- `r2q`: `cursor -> qoder`
- `q2c`: `qoder -> claude`
- `c2x`: `claude -> codex`
- `q2r`: `qoder -> cursor`
- `q2x`: `qoder -> codex`

Alias defaults:

- `x2c`: native Claude session export
- `c2x`: native Codex session export
- `x2x`: native Codex fork export
- `q2x`: native Codex session export
- `q2c`: native Claude session export
- `x2q`: qoder session export
- `c2q`: qoder session export
- all other aliases: handoff bundle
- add `--handoff` to force `.md + .start.txt` output on `x2c`, `c2x`, or `x2x`

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

## Handoff Transforms

`split` and `fork` are transcript-level transforms on top of handoff generation.

- `--split-recent N`: keep the most recent `N` real user turns and everything after them
- `--fork "..."`: append one new user idea before generating the next handoff
- `--fork-file path.txt`: read that new idea from a file instead of the command line

```bash
agent-session-bridge c x --split-recent 1 --out ./idea-handoff.md
agent-session-bridge c x --split-recent 1 --fork "把这个新 idea 单独拉出来" --out ./fork-handoff.md
printf '把这条新想法拆出去，单独研究 prompt 和 fork-file 的体验\n' > ./fork.txt
agent-session-bridge --agent x --fork-file ./fork.txt --copy
```

This is useful for both workflow and token control: the next handoff carries less irrelevant context, which reduces noise and token usage.

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

By default, this installs a Codex-shaped `jsonl` session file under `~/.codex/sessions/YYYY/MM/DD/...` and prints a ready-to-run resume command:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-....jsonl
Run:
codex resume <session-id>
```

Practical workflow:

```bash
agent-session-bridge claude codex --export codex-session
```

If you want to script it, use JSON output and read both `outputPath` and `resumeCommand`:

```bash
agent-session-bridge claude codex --export codex-session --json
```

If you explicitly pass `--out` or `--output-dir`, the file is exported there instead of being installed into Codex's session store. In that case the CLI does not print `codex resume ...`, because the file is not yet resumable in place.

Current scope:

- implemented for `claude`
- emits `session_meta` plus `response_item` user/assistant messages
- intentionally does not try to recreate tool calls, reasoning, or hidden runtime state

This is experimental on purpose. The regular handoff bundle is still the default workflow.

## Experimental Claude Resume Export

There is now an experimental export path for `codex -> claude resume`.

```bash
agent-session-bridge codex claude --export claude-session
agent-session-bridge --agent codex --session ~/.codex/sessions/.../rollout-....jsonl --target claude --export claude-session
```

By default, this installs a Claude-shaped `jsonl` session file under `~/.claude/projects/<project-key>/...` and prints a ready-to-run resume command:

```text
~/.claude/projects/<project-key>/<session-id>.jsonl
Run:
claude --resume <session-id>
```

Practical workflow:

```bash
agent-session-bridge codex claude --export claude-session
```

If you want to script it, use JSON output and read both `outputPath` and `resumeCommand`:

```bash
agent-session-bridge codex claude --export claude-session --json
```

If you explicitly pass `--out` or `--output-dir`, the file is exported there instead of being installed into Claude's session store. In that case the CLI does not print `claude --resume ...`, because the file is not yet resumable in place.

Current scope:

- implemented for `codex`
- emits a minimal Claude-style `jsonl` transcript with `user` / `assistant` rows
- intentionally does not try to recreate tool calls, snapshots beyond the minimal bootstrap row, or hidden runtime state

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
agent-session-bridge x2r --output-dir ./tmp/bridge-out --json
agent-session-bridge x2r
agent-session-bridge claude codex --export codex-session
agent-session-bridge claude codex --export codex-session --json
agent-session-bridge claude codex --export codex-session --output-dir ./tmp/bridge-out
agent-session-bridge c x --session "$(find ~/.claude/projects -type f -name '*.jsonl' | sort | tail -n 1)" --split-recent 1 --fork "把这个新 idea 单独拉出来，做成 fork" --out /tmp/claude-fork.md
agent-session-bridge c2x --session "$(find ~/.claude/projects -type f -name '*.jsonl' | sort | tail -n 1)" --export codex-session --out /tmp/claude-to-codex.jsonl
printf '把这条新想法拆出去，单独研究 prompt 和 fork-file 的体验\n' > /tmp/fork.txt
agent-session-bridge --agent x --session "$(find ~/.codex/sessions -type f -name '*.jsonl' | sort | tail -n 1)" --fork-file /tmp/fork.txt --out /tmp/fork-file.md
```

What to check:

- handoff mode writes two files: `*.md` and `*.start.txt`
- `--copy` copies the `*.start.txt` content, not the raw transcript
- `--session-id` should resolve the same session without needing a full file path
- ambiguous Claude matches should prompt in interactive mode instead of silently picking one
- ambiguous Claude matches should fail in non-interactive mode and tell you to use `--session-id`
- `--json` should print stable metadata fields like `sessionId`, `sessionPath`, `outputPath`, and `promptPath`, not the full transcript body
- `--export codex-session` without explicit output path should install into `~/.codex/sessions/YYYY/MM/DD/...`
- `--export codex-session` should print a `Run: codex resume <session-id>` hint only when the export is installed into Codex's session store
- `--export codex-session --json` should include `resumeCommand` only when the export is directly resumable
- regular handoff output should land under `./tmp/agent-session-bridge/`
- missing parent directories should be created automatically for `--out` and `--output-dir`
- `--output-dir` should keep the generated filenames but place them under the directory you gave it
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
