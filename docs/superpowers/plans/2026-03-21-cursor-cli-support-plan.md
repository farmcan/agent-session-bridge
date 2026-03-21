# Cursor-CLI Support Investigation Plan

> Scope change: no implementation in this pass. Preserve the investigation and recommended architecture for later work.

## Goal

Add `cursor-cli` as a new agent type, distinct from the existing `cursor` IDE transcript adapter, and refactor export support so agent-to-agent session export can scale beyond the current `claude <-> codex` pair.

## Confirmed Findings

### Naming

- The installed Cursor CLI binary is `agent`.
- We should expose it in this project as `cursor-cli`.
- The existing `cursor` adapter should remain unchanged and continue to mean Cursor IDE transcripts.

### CLI Behavior

- `agent --help` shows:
  - `--resume [chatId]`
  - `--continue`
  - `create-chat`
  - `ls`
  - `resume`
- `agent resume --help` is minimal and does not document on-disk format.
- `agent ls` is not usable from the current non-interactive automation harness because it fails with an Ink raw-mode error.

Implication:
- The safest integration path is filesystem-based, not shell-UI scraping.

### On-Disk Session Locations

Two Cursor data stores were confirmed:

1. Project transcript layer:
- `~/.cursor/projects/<project-key>/agent-transcripts/<agentId>/<agentId>.jsonl`
- This is the same family the current `cursor` adapter already reads.

2. Chat/session state layer:
- `~/.cursor/chats/<workspace-or-account-key>/<agentId>/store.db`
- This appears to back `agent --resume <chatId>`.

Related supporting files:
- `~/.cursor/projects/<project-key>/repo.json`
- `~/.cursor/cli-config.json`

### Transcript Format

Observed transcript rows are newline-delimited JSON with a message shape like:

```json
{
  "role": "user",
  "message": {
    "content": [
      {
        "type": "text",
        "text": "<user_query>\n...\n</user_query>"
      }
    ]
  }
}
```

and assistant/tool rows like:

```json
{
  "role": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "..." },
      { "type": "tool_use", "name": "WebSearch", "input": { ... } }
    ]
  }
}
```

Implication:
- `cursor-cli` visible transcript content is structurally very close to the existing `cursor` parser.
- A parser shared with small per-agent differences is realistic.

### Chat Database Format

Confirmed SQLite tables:

- `meta(key TEXT PRIMARY KEY, value TEXT)`
- `blobs(id TEXT PRIMARY KEY, data BLOB)`

Decoded `meta['0']` example:

```json
{
  "agentId": "2b2e912d-7707-436c-b727-7ea81bd639db",
  "latestRootBlobId": "317e1571539ff97e5147f0e2e184ea91161c8082744ca79bcc9a69f1a6b9bb80",
  "name": "Codex Difference",
  "mode": "default",
  "createdAt": 1774095500999,
  "lastUsedModel": "composer-2-fast"
}
```

Implication:
- `agentId` is a strong candidate for the resume/session id.
- `name` can likely become the session title.
- The actual resumable state graph is likely stored in `blobs.data` and linked from `latestRootBlobId`.
- Exporting a truly resumable `cursor-cli` session will probably require understanding blob payload structure, not just transcript JSONL.

## What This Means For Support

### Read/Handoff Support

This should be straightforward:

- Add `cursor-cli` as a distinct agent root.
- Reuse or factor the current Cursor transcript parser.
- Resolve sessions from `~/.cursor/projects/.../agent-transcripts/...`.
- Keep `cursor` and `cursor-cli` separate at the semantic/API level, even if they currently share transcript parsing logic.

### Resume-Export Support

This is still partially unknown:

- `claude -> cursor-cli`
- `codex -> cursor-cli`

Both require enough knowledge of `store.db` blob graph shape to generate a session that `agent --resume <chatId>` will actually accept.

The visible transcript JSONL alone is probably not sufficient for a true resumable export.

### Reverse Export Likelihood

These look more feasible once `cursor-cli` read support exists:

- `cursor-cli -> claude`
- `cursor-cli -> codex`

Reason:
- Those targets already have export serializers in this project.
- If `cursor-cli` can be normalized into the project's shared session shape, these become ordinary source-adapter cases.

## Recommended Architecture

### 1. Split “source adapters” from “export targets”

Current state:
- Parsing and export logic are still organized mostly around specific agents/functions.

Recommended direction:
- `source adapters`: read local session state into one normalized session shape
- `target exporters`: serialize that normalized session shape into target-specific resumable formats

Suggested conceptual interfaces:

```js
sourceAdapter.readSession(sessionPath) -> {
  agent,
  sessionId,
  cwd,
  title,
  updatedAt,
  messages: [{ role, text }]
}

targetExporter.renderResume(session, options) -> {
  target,
  sessionId,
  fileName,
  content,
  installPathInfo,
  resumeCommand
}
```

### 2. Introduce registries

Instead of branching in CLI for each export pair:

- `sourceAdapters[agent]`
- `targetExporters[targetFormat]`

Then route export by target format, not by hardcoded pair-specific code paths.

Example direction:

```js
renderResumeExport({
  sourceAgent: "claude",
  targetFormat: "codex-session"
})
```

and later:

```js
renderResumeExport({
  sourceAgent: "cursor-cli",
  targetFormat: "claude-session"
})
```

### 3. Keep target-format names explicit

Recommended explicit target formats:

- `codex-session`
- `claude-session`
- later: `cursor-cli-session`

This avoids conflating source agent names with export container formats.

### 4. Add capability flags

Not every source/target pair will be possible immediately.

Recommended metadata per exporter:

- `supportsSourceAgents`
- `defaultInstallRoot`
- `buildResumeCommand`
- `isExperimental`

This allows:
- `cursor-cli -> codex` supported first
- `cursor-cli -> claude` supported first
- `claude/codex -> cursor-cli` gated until resumable blob format is understood

## Recommended Delivery Order

1. Add `cursor-cli` source adapter for handoff/read-only parsing.
2. Refactor existing `claude <-> codex` export code behind shared exporter interfaces.
3. Add `cursor-cli -> codex` export.
4. Add `cursor-cli -> claude` export.
5. Investigate `store.db` blob payloads for true `cursor-cli-session` export.
6. Only then attempt:
   - `claude -> cursor-cli`
   - `codex -> cursor-cli`

## Proposed Verification Commands For Future Work

Read-path validation:

```bash
agent-session-bridge --agent cursor-cli --session <cursor-transcript.jsonl> --stdout
```

Resume-export validation:

```bash
agent-session-bridge cursor-cli codex --export codex-session --json
agent-session-bridge cursor-cli claude --export claude-session --json
```

True Cursor CLI resume validation, once implemented:

```bash
agent-session-bridge claude cursor-cli --export cursor-cli-session --json
agent --resume <chatId>
```

## Open Questions

1. What exact blob payload structure is stored in `store.db.blobs.data`?
2. Is `agentId` alone sufficient for `agent --resume`, or is the parent chat directory key also significant?
3. Can Cursor CLI resume from transcript-only data, or does it require the full blob graph?
4. Is there an easier supported export/import surface hidden behind `agent create-chat` or another subcommand?
