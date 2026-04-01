# Session Story Engine Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current DOM-first session-story stage with a game-style renderer that can produce spatial, room-based, pixel-art replay scenes.

**Architecture:** Keep the CLI, event extraction, and export contract. Replace the stage renderer with a dedicated engine-backed scene, preferably Phaser in a hybrid HTML-shell layout. Phase delivery so each step preserves a working replay export.

**Tech Stack:** Node.js, standalone HTML export, Phaser or PixiJS-based stage, existing test runner

---

## Chunk 1: Renderer Decision

- [ ] Confirm engine choice: Phaser (recommended) or PixiJS stack
- [ ] Lock the renderer boundary: exported payload shape, stage mount point, replay control interface
- [ ] Define room taxonomy: human, reasoning, and tool-category wings

## Chunk 2: Payload Stabilization

- [ ] Extend story payload with stable room / category metadata
- [ ] Add route semantics so each event maps to a room and movement target
- [ ] Add tests for categorized tool routes and fallback cases

## Chunk 3: Stage Replacement

- [ ] Introduce a dedicated stage renderer module
- [ ] Replace the current DOM-stage implementation behind the same export mode
- [ ] Render map, rooms, corridors, and actor sprites in the engine scene
- [ ] Keep existing HTML side panel and replay controls

## Chunk 4: Replay Motion

- [ ] Implement room-to-room movement animation
- [ ] Add room entry / exit beats, bubble timing, and arrival emphasis
- [ ] Add camera follow or room focus transitions
- [ ] Preserve replay, pause, step, and speed control behavior

## Chunk 5: Spatial Polish

- [ ] Add foreground / background separation for stronger depth
- [ ] Add category-wing level signage and stronger room grouping
- [ ] Add tool-specific room props for top used tools

## Chunk 6: Verification

- [ ] Add targeted export tests for the new renderer output contract
- [ ] Run `node --test test/bridge.test.js`
- [ ] Export at least one real Codex session and verify the generated HTML manually
