# Adapter Architecture And Qoder Exports Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the CLI around source adapters, target exporters, and orchestration helpers, then add qoder/qodercli export paths to Codex, Claude, and a non-resumable Qoder session format.

**Architecture:** Move source-specific discovery and parsing into adapter files, move target-specific export rendering and install behavior into target exporters, and centralize alias/default-export/capability rules in a small core routing layer. Keep the normalized session model so future agent pairs only need a source adapter and a target exporter registration.

**Tech Stack:** Node.js 20, built-in test runner, ESM modules, JSONL transcript parsing.

---

## Chunk 1: Core Split

### Task 1: Source adapters

**Files:**
- Create: `src/adapters/sources/codex.js`
- Create: `src/adapters/sources/claude.js`
- Create: `src/adapters/sources/qoder.js`
- Create: `src/adapters/sources/cursor.js`
- Create: `src/adapters/sources/index.js`

- [x] Move parsing and cwd extraction behind adapter modules.
- [x] Keep the normalized session shape unchanged.

### Task 2: Core helpers

**Files:**
- Create: `src/core/agents.js`
- Create: `src/core/files.js`
- Create: `src/core/discovery.js`
- Create: `src/core/routing.js`
- Create: `src/core/install.js`
- Create: `src/core/exporting.js`
- Create: `src/core/session-transforms.js`

- [x] Move shared agent metadata, discovery, install policy, routing, and transforms into core modules.
- [x] Preserve existing discovery behavior and ambiguity handling.

## Chunk 2: Target Exporters

### Task 3: Native exporters

**Files:**
- Create: `src/adapters/targets/codex-session.js`
- Create: `src/adapters/targets/claude-session.js`
- Create: `src/adapters/targets/qoder-session.js`
- Create: `src/adapters/targets/handoff.js`
- Create: `src/adapters/targets/index.js`

- [x] Move handoff generation into an explicit target exporter.
- [x] Reuse the normalized session model for Codex and Claude native exports.
- [x] Add a best-effort Qoder session export without resume hints.

## Chunk 3: CLI Migration

### Task 4: Route the CLI through the new layers

**Files:**
- Modify: `src/cli.js`
- Modify: `src/index.js`

- [x] Keep `x2c`, `c2x`, and `x2x` defaulting to native export.
- [x] Add `q2x`, `q2c`, `x2q`, and `c2q` native export defaults.
- [x] Keep `--handoff` as the explicit fallback path.
- [x] Preserve stdout/json/clipboard/output-dir behavior.

## Chunk 4: Verification

### Task 5: Tests and docs

**Files:**
- Modify: `test/bridge.test.js`
- Modify: `README.md`

- [x] Add tests for routing defaults and qoder export paths.
- [x] Add end-to-end CLI coverage for `q2x`, `q2c`, `x2q`, and `c2q`.
- [x] Update the README to explain the adapter/export architecture and the new command defaults.
