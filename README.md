# agent-session-bridge

Move local coding-agent context from one agent to another in one command.

`agent-session-bridge` reads local session data from `Codex`, `Claude`, `Cursor`, `Qoder`, and `QoderCLI`, normalizes the transcript, and writes a handoff bundle for the next agent.

## Why

When you run multiple coding agents in parallel, context gets trapped inside each tool's local session store. This project gives you the shortest path from one local agent session to another agent handoff.

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
```

Or run it directly after clone:

```bash
node src/cli.js
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
node src/cli.js
node src/cli.js --agent claude --stdout
node src/cli.js --agent codex --stdout
node src/cli.js --agent qoder --session ~/.qoder/projects/.../session.jsonl --stdout
node src/cli.js --agent cursor --session ~/.cursor/projects/.../agent-transcripts/...jsonl --stdout
node src/cli.js --agent qodercli --target cursor --stdout
node src/cli.js --copy
node src/cli.js --cursor
node src/cli.js --out ./handoff.md
```

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

If you use this a lot, shell aliases are the best workflow. Add these to `~/.zshrc`:

```bash
alias c2r='agent-session-bridge --agent codex --target cursor --copy'
alias r2c='agent-session-bridge --agent cursor --target codex --copy'
alias q2c='agent-session-bridge --agent qoder --target codex --copy'
```

Before using the aliases, install the CLI globally from this repo:

```bash
npm install
npm link
```

Reload your shell:

```bash
source ~/.zshrc
```

Then you can run:

```bash
c2r
r2c
q2c
```

To verify that `c2r` is really working, run a stdout-only version first:

```bash
alias c2r='agent-session-bridge --agent codex --target cursor --stdout'
c2r | sed -n '1,12p'
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
alias c2r='agent-session-bridge --agent codex --target cursor --copy'
```

The default command writes a file like:

```text
./agent-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.md
./agent-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.start.txt
```

## How It Works

- Finds the most relevant session for the selected agent based on your current directory
- Parses the local `jsonl` session log with an agent-specific adapter
- Pulls extra metadata when available
- `Qoder` / `QoderCLI`: also reads the sidecar `*-session.json` for title, working directory, and update time
- Normalizes messages into one shared transcript format
- Produces a Markdown handoff file plus a startup prompt for the target agent

## Development

```bash
npm test
```

Real smoke tests I used on this machine:

```bash
node src/cli.js --agent claude --session "$(find ~/.claude/projects -type f -name '*.jsonl' | sort | tail -n 1)" --stdout
node src/cli.js --agent codex --session "$(find ~/.codex/sessions -type f | sort | tail -n 1)" --stdout
node src/cli.js --agent qoder --session "$(find ~/.qoder/projects -type f -name '*.jsonl' | sort | tail -n 1)" --stdout
node src/cli.js --agent cursor --session "$(find ~/.cursor/projects -type f -path '*/agent-transcripts/*/*.jsonl' | sort | tail -n 1)" --stdout
```

## Roadmap

- Support more agent formats beyond the current adapter set
- Improve transcript summarization for long sessions
- Offer richer target-specific startup prompts

## License

MIT
