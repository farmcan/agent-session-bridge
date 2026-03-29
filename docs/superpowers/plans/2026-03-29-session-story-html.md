# Session Story HTML Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local single-file HTML export that replays a session as a pixel-style anthropomorphic story with animated human, agent, and tool events.

**Architecture:** Extend parsing with optional raw items, normalize session events into a story timeline, then render a standalone HTML document that uses PixiJS for the stage and Anime.js for sequencing. Wire the new export format into CLI routing and install resolution with tmp output by default.

**Tech Stack:** Node.js, built-in test runner, standalone HTML/CSS/JS, PixiJS CDN, Anime.js CDN

---

## Chunk 1: Event Model
- [ ] Add failing tests for story event extraction and HTML export.
- [ ] Extend parseSession/exportSession pipeline to preserve raw items for story rendering.
- [ ] Add event normalization that maps user, assistant, commentary, tool call, and tool result rows into a stable timeline.

## Chunk 2: HTML Renderer
- [ ] Add standalone HTML renderer with embedded CSS/JS and CDN-loaded PixiJS + Anime.js.
- [ ] Build pixel-stage actors, timeline cards, playback controls, and event filtering.
- [ ] Ensure graceful fallback when only coarse messages are available.

## Chunk 3: CLI Integration
- [ ] Add a new export format and CLI affordance for generating story HTML.
- [ ] Route outputs to tmp by default and support --out/--output-dir.
- [ ] Update README with usage examples and library choices.

## Chunk 4: Verification
- [ ] Run targeted tests for event extraction, HTML export, and CLI integration.
- [ ] Run full test suite.
