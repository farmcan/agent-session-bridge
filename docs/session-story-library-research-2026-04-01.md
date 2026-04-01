# Session Story Library Research

Date: 2026-04-01

## Goal

Find a JavaScript animation / game stack that is materially better than the current DOM-first prototype for:

- pixel-art staging
- room-based spatial storytelling
- character movement between rooms
- richer camera / depth / pathing
- local HTML output or a lightweight build pipeline

## Shortlist

### 1. Phaser

- Repo: https://github.com/phaserjs/phaser
- Why it matters:
  - full 2D game framework
  - scene system, camera, sprites, path-like movement, input, timers
  - supports CDN and npm
  - well suited for “agent walks between rooms and acts” storytelling
- Evidence:
  - official repo says it is one of the most starred game frameworks on GitHub
  - GitHub page shows active development and broad ecosystem support
- Fit for this project:
  - strongest option if we want the replay to feel like a real pixel game
  - higher integration cost than patching current DOM scene

### 2. PixiJS

- Repo: https://github.com/pixijs/pixijs
- Stars seen in current sources: about 46k+
- Why it matters:
  - very strong 2D renderer
  - flexible enough for custom maps, rooms, particles, UI, sprites
  - lower-level than Phaser, but much easier to integrate incrementally
- Fit for this project:
  - best choice if we want to keep tight control over the output format
  - good migration path from current prototype

### 3. PixiJS ecosystem plugins

- Tilemap: https://github.com/pixijs-userland/tilemap
  - current source shows about 322 stars
  - useful for fast room floors, corridors, isometric-ish maps
- Viewport: https://github.com/pixijs-userland/pixi-viewport
  - current source shows about 1.2k stars
  - useful for camera follow / pan / zoom
- Actions: https://github.com/reececomo/pixijs-actions
  - small but directly relevant to sprite action choreography
  - useful for declarative character movement / timing

### 4. Kaboom

- Repo: https://github.com/replit/kaboom
- Current source shows about 2.7k stars
- Why it matters:
  - simple and pleasant API for quick game-like prototypes
  - good for tiny pixel scenes
- Fit for this project:
  - faster to prototype than Phaser
  - not as strong as Phaser for a production-quality spatial replay viewer

### 5. melonJS

- Repo: https://github.com/melonjs/melonJS
- Why it matters:
  - mature HTML5 game engine
  - built-in game-engine structure
- Fit for this project:
  - viable, but less compelling than Phaser for ecosystem and mindshare

## Recommendation

### Recommended direction: Phaser for the stage, keep current CLI / export pipeline

This is the clearest path if the target is:

- “not a page with effects”
- but “a real animated spatial replay”

Why:

1. Phaser already thinks in terms of scenes, sprites, timed actions, and game loops.
2. Our problem is no longer “add more animation.” It is “build a tiny replay game.”
3. Phaser gives us camera, depth tricks, room transitions, layered maps, and stronger motion primitives out of the box.

## Backup option

### Safer incremental direction: PixiJS + Tilemap + Viewport

Choose this if we want:

- maximum control
- easiest progressive migration from the current renderer
- smaller conceptual jump from current code

Choose this only if we are willing to author more engine-like behavior ourselves:

- pathing
- scene orchestration
- room transitions
- action sequencing

## Proposed architecture

### Keep

- current session parsing
- current event extraction
- current `session-story-html` export mode

### Replace

- current DOM-first stage renderer
- hand-authored room layout logic
- ad-hoc motion choreography

### New renderer contract

The HTML export should receive a compact replay payload:

- rooms / zones
- event sequence
- actor routes
- tool categories
- timing / speed metadata

Then a dedicated renderer should own:

- map generation
- room placement
- camera / viewport
- sprite movement
- speech bubbles
- replay controls

## Migration options

### Option A: Full Phaser scene export

- Export a small built Phaser app shell and embed the replay payload into it.
- Strongest result.
- Heaviest migration.

### Option B: Hybrid HTML shell + Phaser canvas stage

- Keep current side panel and controls in HTML.
- Replace only the stage with a Phaser canvas scene.
- Best trade-off.
- Recommended implementation path.

### Option C: Improve current DOM renderer further

- Lowest risk.
- Wrong direction for the target quality bar.

## Recommendation summary

Use Option B:

- HTML shell for controls and timeline
- Phaser for the map scene
- reuse current payload and CLI

That gives us:

- real spatial rooms
- agent pathing
- room entry / exit animation
- better depth and scale
- lower rewrite cost than rebuilding the whole export system

## Sources

- Phaser GitHub: https://github.com/phaserjs/phaser
- Phaser docs / repo details via GitHub result: https://github.com/phaserjs/phaser
- PixiJS GitHub: https://github.com/pixijs/pixijs
- Pixi Tilemap: https://github.com/pixijs-userland/tilemap
- Pixi Viewport: https://github.com/pixijs-userland/pixi-viewport
- PixiJS Actions: https://github.com/reececomo/pixijs-actions
- Kaboom: https://github.com/replit/kaboom
- melonJS: https://github.com/melonjs/melonJS
