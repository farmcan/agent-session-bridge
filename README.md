# agent-session-bridge

Minimal open source CLI for moving a local Codex session into Cursor.

It reads `~/.codex/sessions/**/*.jsonl`, picks the latest session by default, extracts the useful user/assistant messages, and writes a Markdown handoff file you can open or paste into Cursor.

## Why

When you run multiple coding agents in parallel, context is trapped in each tool's local session store. This project gives you the shortest path from a Codex session to a Cursor-ready handoff.

## Install

```bash
npm install
```

## Usage

```bash
node src/cli.js
```

This writes a file like:

```text
./cursor-handoff-rollout-2026-03-19T18-09-41-019d0592-84fc-7650-b1a2-37bd7d7ac211.md
```

Useful flags:

```bash
node src/cli.js --stdout
node src/cli.js --copy
node src/cli.js --cursor
node src/cli.js --session ~/.codex/sessions/2026/03/19/rollout-xxx.jsonl
node src/cli.js --out ./handoff.md
```

## What it does

- Finds the newest Codex session file, unless you pass `--session`
- Parses the `jsonl` session log
- Keeps user/assistant text messages
- Drops commentary noise
- Produces a single Markdown file for Cursor

## License

MIT
