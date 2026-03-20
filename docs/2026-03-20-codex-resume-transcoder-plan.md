# Codex Resume Transcoder Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate and, if feasible, implement a transcoder that converts a foreign local agent session into a Codex-native session file that can be resumed with `codex resume <session-id>`.

**Current judgment:** This looks possible in principle, but it is not a trivial file rename. `Codex` stores a specific event log shape with `session_meta` and Codex-specific transcript items. A safe approach is to treat this as a compatibility experiment first, then only ship support after a real `codex resume` round-trip passes.

**Target scope for the first experiment:** `claude -> codex`

**Why Claude first:** Claude already stores a readable local transcript with `cwd`, `sessionId`, `user`, and `assistant` entries. It is the cleanest candidate for proving whether a synthetic Codex session can be resumed.

---

## Research Update

Black-box experiments on 2026-03-20 materially changed the feasibility assessment.

### What was verified

- `HOME` redirection works for Codex resume experiments.
  - By copying `auth.json` and `config.toml` into an isolated temp home and writing synthetic files under `temp/.codex/sessions/...`, `codex resume` and `codex exec resume` read only the synthetic session store.
- `codex resume <session-id>` discovery depends on the filename pattern, not only JSON contents.
  - A file whose `session_meta.payload.id` matched the requested id was **not** discoverable until the filename also embedded that id in the normal `rollout-...-<session_id>.jsonl` format.
- `session_meta` is enough for Codex to recognize a session as resumable.
  - A file containing only `session_meta` still reached the “Choose working directory to resume this session” UI.
- `response_item` message history is used as real resumed context.
  - Synthetic session:
    - `session_meta`
    - `response_item` user: `USER_CANARY_X9K2`
    - `response_item` assistant: `ASSISTANT_CANARY_Q7P4`
  - Test:
    - `codex exec resume <id> "Before this turn, did the resumed history contain the exact string USER_CANARY_X9K2? Answer only yes or no." --json`
  - Result:
    - Codex answered `yes`
- `event_msg` history alone is **not** sufficient for model context restoration.
  - Synthetic session:
    - `session_meta`
    - `event_msg` user_message: `USER_CANARY_EVT_M4N8`
    - `event_msg` agent_message: `ASSISTANT_CANARY_EVT_R2D6`
  - Same `codex exec resume` canary test result:
    - Codex answered `no`

### Updated conclusion

- A `claude -> codex resume` transcoder is **feasible**.
- The transcoder should target Codex `response_item` message records as the primary payload.
- `event_msg` records may still be useful for UI rendering or transcript completeness, but they are not enough by themselves for contextual continuation.
- Full parity with native Codex sessions is still unproven.
  - We have not yet shown whether tool calls, function outputs, reasoning items, or `turn_context` materially improve follow-up quality.

---

## Findings

### Codex

- Root: `~/.codex/sessions/YYYY/MM/DD/`
- File shape: `rollout-<timestamp>-<session_id>.jsonl`
- Important records observed:
  - `session_meta`
  - `response_item`
  - `event_msg`
- Important `session_meta.payload` fields observed:
  - `id`
  - `timestamp`
  - `cwd`
  - `originator`
  - `cli_version`
  - `source`
  - `model_provider`
  - `base_instructions.text`
- Resume mechanism observed:
  - `codex resume <session_id>`
  - session id appears to be embedded in the filename and transcript metadata

### Claude

- Root: `~/.claude/projects/<project-key>/`
- File shape: `<session_id>.jsonl`
- Important records observed:
  - `user`
  - `assistant`
  - `system`
  - `file-history-snapshot`
- Important fields observed:
  - `cwd`
  - `sessionId`
  - `message.role`
  - `message.content`
- Additional runtime index observed:
  - `~/.claude/sessions/*.json`
  - useful for process/session bookkeeping, but not the primary transcript source

### Qoder

- Root: `~/.qoder/projects/...`
- Transcript: `<session_id>.jsonl`
- Sidecar metadata: `<session_id>-session.json`
- Useful sidecar fields observed:
  - `id`
  - `title`
  - `working_dir`
  - `updated_at`
  - counters and usage stats

### Cursor

- Root: `~/.cursor/projects/<project-key>/`
- Transcript: `agent-transcripts/<session_id>/<session_id>.jsonl`
- Current observation:
  - project identity is derived from directory structure
  - transcript content looks simpler than Codex and does not expose a Codex-like session header

---

## Architecture Hypothesis

The likely architecture is:

1. read foreign session
2. normalize to shared internal transcript
3. synthesize a Codex-compatible session whose primary conversational payload is `response_item` message records
4. write it into a Codex session path with a synthetic session id
5. test whether `codex resume <synthetic-id>` actually opens and continues

If step 5 fails, the feature should not be marketed as “supported”. At that point the fallback remains the current handoff bundle workflow.

---

## Open Questions

- [x] What is the smallest valid Codex session that `codex resume` accepts?
  Current evidence: `session_meta` alone is enough for session discovery and resume entry.
- [ ] Does `codex resume` require only transcript records, or also hidden assumptions tied to `cli_version`, `originator`, or `base_instructions`?
- [x] Are Codex tool calls required to be represented explicitly, or can a plain user/assistant message history resume successfully?
  Current evidence: plain `response_item` user/assistant history is enough to restore at least simple contextual memory.
- [x] Does Codex validate filename format, metadata timestamps, or record ordering?
  Current evidence: filename format matters for id discovery. Timestamp and ordering constraints remain only partially tested.
- [ ] Can a synthetic session safely live beside real sessions under `~/.codex/sessions`, or should testing use an isolated Codex home?

---

## File Structure

Planned files and responsibilities:

- Create: `docs/codex-resume/compatibility-notes.md`
  - living notes for observed Codex transcript schema details and resume behavior
- Create: `docs/codex-resume/claude-to-codex-mapping.md`
  - field-by-field mapping from Claude records to synthetic Codex records
- Create: `fixtures/sample-codex-minimal-session.jsonl`
  - smallest known-good Codex session fixture
- Create: `fixtures/sample-claude-to-codex-expected.jsonl`
  - expected synthetic output for one Claude fixture
- Modify: `src/index.js`
  - expose structured session data and, later, synthetic Codex output helpers
- Modify: `src/cli.js`
  - future flags for explicit `--session-id` and maybe export mode selection
- Modify: `test/bridge.test.js`
  - add transcoder coverage once the compatibility contract is clear

---

## Chunk 1: Reverse-Engineer the Minimal Codex Session

### Task 1: Build a Codex compatibility corpus

**Files:**
- Create: `docs/codex-resume/compatibility-notes.md`
- Create: `fixtures/sample-codex-minimal-session.jsonl`

- [ ] **Step 1: Compare several real Codex sessions**

Inspect multiple local Codex sessions with different lengths and tool usage. Record:
- stable top-level record types
- required metadata keys
- ordering guarantees
- any fields that appear in every resumable session

- [ ] **Step 2: Identify a minimal resumable subset**

Define the smallest transcript shape worth testing first:
- one `session_meta`
- one or more `response_item` user/assistant turns
- no tool events unless proven necessary

- [ ] **Step 3: Preserve one sanitized minimal fixture**

Create a sanitized local fixture that captures the smallest known-good Codex resume shape.

---

## Chunk 2: Design the Claude to Codex Mapping

### Task 2: Specify a deterministic transcoding contract

**Files:**
- Create: `docs/codex-resume/claude-to-codex-mapping.md`
- Create: `fixtures/sample-claude-to-codex-expected.jsonl`

- [ ] **Step 1: Define field mapping**

Initial mapping should cover:
- Claude `sessionId` -> synthetic Codex `session_meta.payload.id`
- Claude `cwd` -> Codex `session_meta.payload.cwd`
- Claude `user` / `assistant` text -> Codex `response_item` message records
- Claude timestamps -> synthetic or copied Codex timestamps where required

- [ ] **Step 2: Define what gets dropped**

Explicitly exclude until proven useful:
- Claude `system`
- Claude `file-history-snapshot`
- Claude `thinking`
- Claude `tool_result`

- [ ] **Step 3: Define synthetic defaults**

Choose safe defaults for Codex-only metadata such as:
- `originator`
- `cli_version`
- `source`
- `model_provider`
- `base_instructions`

These defaults should be documented as compatibility placeholders, not “true provenance”.

---

## Chunk 3: Add an Offline Transcoder Prototype

### Task 3: Generate Codex-shaped output without claiming resume support yet

**Files:**
- Modify: `src/index.js`
- Modify: `test/bridge.test.js`

- [ ] **Step 1: Add fixture-first tests**

Add tests that:
- parse a Claude fixture
- synthesize a Codex-shaped session
- assert record ordering and required metadata fields

- [ ] **Step 2: Implement the smallest possible transcoder**

Do not wire this into the main CLI flow first. Keep it behind an internal helper or experimental export path until real resume validation passes.

- [ ] **Step 3: Compare against the minimal Codex fixture**

Check whether the synthetic output is structurally close to a real minimal Codex session, not just logically equivalent.

---

## Chunk 4: Validate with Real `codex resume`

### Task 4: Prove or reject runtime compatibility

**Files:**
- Modify: `docs/codex-resume/compatibility-notes.md`
- Test: local manual smoke workflow

- [ ] **Step 1: Write synthetic sessions into an isolated Codex session store**

Avoid polluting real history. Prefer an isolated Codex home or temporary session root if Codex supports it.

- [ ] **Step 2: Attempt real resume**

Run:
- `codex resume <synthetic-session-id>`

Success criteria:
- Codex opens the session
- prior transcript is visible
- a new turn can be appended without corruption

- [ ] **Step 3: Record failure modes exactly**

If resume fails, capture:
- CLI error output
- which field or record shape caused rejection
- whether the failure is hard validation or degraded rendering

Do not claim support until this step passes.

---

## Chunk 5: Decide Product Shape

### Task 5: Choose how this ships if validation succeeds

**Files:**
- Modify: `README.md`
- Modify: `blog/2026-03-19-agent-session-bridge.md`

- [ ] **Step 1: Decide whether this is experimental-only**

Possible product shapes:
- hidden experimental command
- explicit `--export codex-session`
- separate `bridge-to-codex-resume` subcommand

- [ ] **Step 2: Keep the current handoff flow as default**

Even if resume conversion works, the default should probably remain:
- handoff markdown
- startup prompt

Resume conversion is a stronger claim and should be opt-in.

- [ ] **Step 3: Document hard limits**

If shipping, state clearly:
- this migrates visible transcript only
- this does not transfer hidden model state
- tool histories may be incomplete or synthetic

---

## Chunk 6: Expand Beyond Claude

### Task 6: Generalize only after Claude passes

**Files:**
- Modify: `src/index.js`
- Modify: `test/bridge.test.js`
- Modify: `docs/codex-resume/compatibility-notes.md`

- [ ] **Step 1: Evaluate `qoder -> codex`**

Use `qoder` transcript plus `*-session.json` sidecar metadata to build a similar mapping.

- [ ] **Step 2: Evaluate `cursor -> codex`**

Confirm whether Cursor transcript fidelity is high enough for a useful Codex reconstruction.

- [ ] **Step 3: Add support matrix entries only after runtime proof**

Mark each source as supported for Codex resume only after:
- synthetic output generation works
- real `codex resume` passes
- at least one real local smoke test succeeds

---

## Verification

- [ ] Run `npm test`
- [ ] Run an offline fixture test for synthetic `claude -> codex` output
- [ ] Run a real local `codex resume <synthetic-session-id>` smoke test in isolation
- [ ] Confirm the synthetic session can accept one more user turn without breaking
- [ ] Record final decision: supported, experimental, or rejected

---

## Notes

- The best first version is not “all agents can resume in Codex”.
- The best first version is “prove Claude can be transcoded into a minimal Codex session that survives a real resume”.
- If that experiment fails, the current two-stage handoff remains the correct product direction.
