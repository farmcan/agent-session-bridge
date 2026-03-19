# agent-session-bridge

Minimal open source CLI for moving a local Codex session into Cursor.

It reads `~/.codex/sessions/**/*.jsonl`, picks the latest session by default, extracts the useful user and assistant messages, and writes a Markdown handoff file you can open or paste into Cursor.

## Why

When you run multiple coding agents in parallel, context gets trapped inside each tool's local session store. This project gives you the shortest path from a Codex session to a Cursor-ready handoff.

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
# Codex Session Handoff

Session ID: 019d0592-84fc-7650-b1a2-37bd7d7ac211
Working Directory: /Users/levi/wrksp

## Transcript

[user] Please add a dark mode toggle.

[assistant] I found the settings panel and will add the toggle there.
```

## Usage

```bash
node src/cli.js
node src/cli.js --stdout
node src/cli.js --copy
node src/cli.js --cursor
node src/cli.js --session ~/.codex/sessions/2026/03/19/rollout-xxx.jsonl
node src/cli.js --out ./handoff.md
```

The default command writes a file like:

```text
./cursor-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.md
```

## How It Works

- Finds the newest Codex session file unless you pass `--session`
- Parses the `jsonl` session log
- Keeps user and assistant text messages
- Drops commentary noise
- Produces a single Markdown file for Cursor

## Development

```bash
npm test
```

## Roadmap

- Support more agent formats beyond Codex
- Trim or summarize large sessions automatically
- Offer richer prompt templates for Cursor handoff

## License

MIT
