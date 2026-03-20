# Agent Session Bridge Skill Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package `agent-session-bridge` as an agent skill so users can invoke session handoff from a skill workflow instead of manually composing CLI commands.

**Architecture:** Keep the existing CLI as the stable core engine, then add a thin skill wrapper around it. The skill should guide the agent to pick a source agent, resolve the relevant local session by current directory or explicit session id, generate the handoff bundle (`.md` + `.start.txt`), and tell the next agent how to consume it.

**Tech Stack:** Node.js CLI, markdown docs, skill metadata / prompt files, existing local session adapters.

---

## File Structure

Planned files and responsibilities:

- Create: `docs/skill/agent-session-bridge-skill-spec.md`
  - Product-facing spec for what the skill should do, supported agents, and constraints.
- Create: `docs/skill/agent-session-bridge-skill-prompt.md`
  - Draft prompt contract for the future skill.
- Create: `docs/skill/examples/`
  - Example invocations and example outputs.
- Create: `skills/agent-session-bridge/SKILL.md`
  - Actual skill entrypoint, once implementation starts.
- Create: `skills/agent-session-bridge/templates/`
  - Reusable prompt snippets for startup prompt generation or handoff instructions.
- Modify: `src/cli.js`
  - Add any flags needed to make the CLI friendlier as a backend for a skill.
- Modify: `src/index.js`
  - Expose any extra structured outputs needed by the skill layer.
- Modify: `README.md`
  - Add a “use as a skill” section after implementation.
- Modify: `blog/2026-03-19-agent-session-bridge.md`
  - Mention the skill direction once it exists.

---

## Chunk 1: Define the Skill Product Shape

### Task 1: Write the product spec for the skill

**Files:**
- Create: `docs/skill/agent-session-bridge-skill-spec.md`

- [ ] **Step 1: Write the spec document**

Cover:
- user story: “I want one agent to hand work to another without pasting long transcript context”
- source agents supported initially: `codex`, `claude`, `cursor`, `qoder`, `qodercli`
- output artifacts: handoff markdown + startup prompt
- default selection behavior: prefer current directory, then fallback
- explicit override behavior: session file path, future session id flag
- non-goals: full runtime migration, hidden state transfer, internal database mutation

- [ ] **Step 2: Review for scope discipline**

Check that the spec stays focused on wrapping existing CLI behavior, not inventing a second orchestration engine.

---

## Chunk 2: Define the Skill Interface

### Task 2: Design the user-facing invocation model

**Files:**
- Create: `docs/skill/agent-session-bridge-skill-prompt.md`
- Create: `docs/skill/examples/invocations.md`

- [ ] **Step 1: Define the core skill inputs**

Document these inputs:
- source agent
- target agent
- optional explicit session id
- optional explicit session file
- optional destination path
- optional “copy vs file vs stdout” behavior

- [ ] **Step 2: Define the minimal skill workflow**

Document the future flow:
1. detect current directory
2. select source session
3. generate handoff bundle
4. return path(s) and short instructions

- [ ] **Step 3: Define example skill invocations**

Examples to cover:
- `codex -> cursor`
- `claude -> codex`
- `qoder -> claude`
- explicit session file override

---

## Chunk 3: Prepare the CLI as a Skill Backend

### Task 3: Identify CLI gaps before skill implementation

**Files:**
- Modify: `src/cli.js`
- Modify: `src/index.js`
- Test: `test/bridge.test.js`

- [ ] **Step 1: Write a gap checklist in the plan**

Checklist should evaluate whether the CLI needs:
- `--session-id`
- `--format json` or another structured mode
- explicit output directory control
- machine-readable summary fields
- “no clipboard” behavior for non-interactive skill usage

- [ ] **Step 2: Add failing tests only after choosing the first missing capability**

Do not add speculative flags all at once. Pick the first capability the skill wrapper truly needs and drive it with tests.

- [ ] **Step 3: Implement only the minimal backend changes**

Keep CLI compatibility intact. The skill should wrap the CLI, not fork behavior.

---

## Chunk 4: Implement the Skill Wrapper

### Task 4: Create the first skill package

**Files:**
- Create: `skills/agent-session-bridge/SKILL.md`
- Create: `skills/agent-session-bridge/templates/start.txt`
- Create: `skills/agent-session-bridge/templates/result.txt`

- [ ] **Step 1: Write the failing integration expectation**

Describe, in a doc or test harness note, the expected output of the skill:
- ask for or infer source/target agents
- run the CLI
- return generated file paths
- instruct the next agent to read `.start.txt` and `.md`

- [ ] **Step 2: Draft `SKILL.md`**

The skill should:
- explain when it should be used
- call the CLI with safe defaults
- prefer current directory matching
- avoid dumping raw transcript into the live conversation when files can be generated instead

- [ ] **Step 3: Add templates for startup instructions**

Keep reusable prompt snippets in templates so the skill prompt stays small and maintainable.

---

## Chunk 5: Docs and Launch Readiness

### Task 5: Document the skill workflow

**Files:**
- Modify: `README.md`
- Modify: `blog/2026-03-19-agent-session-bridge.md`
- Create: `docs/skill/examples/`

- [ ] **Step 1: Add a “Use as a Skill” README section**

Show:
- when to use the skill
- how it differs from direct CLI usage
- what files get generated

- [ ] **Step 2: Update the blog**

Add a short section explaining that the project can evolve from CLI tool to skill wrapper because the core abstraction is already “session in -> handoff bundle out”.

- [ ] **Step 3: Add example outputs**

Include:
- handoff markdown example
- startup prompt example
- short terminal transcript of skill-like usage

---

## Chunk 6: Verification

### Task 6: Validate the future skill path

**Files:**
- Test: `test/bridge.test.js`
- Test: any future `skills/agent-session-bridge/tests/`

- [ ] **Step 1: Run the CLI tests**

Run: `npm test`
Expected: all existing bridge tests pass

- [ ] **Step 2: Run at least one real local smoke test per supported source**

Run:
- `agent-session-bridge --agent codex --stdout`
- `agent-session-bridge --agent claude --stdout`
- `agent-session-bridge --agent qoder --stdout`
- `agent-session-bridge --agent cursor --stdout`

Expected: each resolves a session and produces a valid handoff bundle or stdout transcript

- [ ] **Step 3: Verify the skill wrapper never depends on hidden internal state**

Check that the skill can function entirely from:
- local session files
- current working directory
- explicit user inputs

---

## Notes

- The best version of this feature is probably **CLI core + skill wrapper**, not “replace CLI with a skill”.
- The skill should stay thin. The heavy lifting should remain in `src/index.js` and `src/cli.js`.
- `Qoder` sidecar metadata and the two-stage handoff bundle are already strong primitives for a future skill experience.
- A future `--session-id` flag is likely the most valuable backend improvement before implementing the skill itself.

