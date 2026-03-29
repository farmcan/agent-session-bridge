import { buildStoryPayload } from "../../core/story-events.js";

function escapeForScript(value) {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

function sanitizeFileToken(value) {
  return String(value ?? "session-story")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64) || "session-story";
}

function roomMarkup(room) {
  return `<div class="room room-${room.kind}" data-room-id="${room.id}" style="left:${room.left}%; top:${room.top}%;">
    <div class="room-face">
      <div class="room-eyebrow">${room.eyebrow}</div>
      <div class="room-title">${room.title}</div>
      <div class="room-copy">${room.copy}</div>
      <div class="room-door"></div>
      <div class="room-icon room-icon-${room.icon}"></div>
    </div>
  </div>`;
}

function wingMarkup(wing) {
  return `<div class="wing wing-${wing.kind}" style="left:${wing.left}%; top:${wing.top}%; width:${wing.width}%; height:${wing.height}%;">
    <div class="wing-label">${wing.title}</div>
  </div>`;
}

function renderStoryHtml(payload) {
  const serialized = escapeForScript(payload);
  const toolRooms = Array.isArray(payload.toolRooms) ? payload.toolRooms : [];
  const toolWingLayouts = {
    filesystem: { title: "Filesystem Wing", left: 61, top: 8, width: 24, height: 25, slots: [{ left: 69, top: 18 }, { left: 81, top: 18 }] },
    terminal: { title: "Terminal Wing", left: 61, top: 38, width: 24, height: 25, slots: [{ left: 69, top: 48 }, { left: 81, top: 48 }] },
    search: { title: "Search Wing", left: 61, top: 68, width: 24, height: 20, slots: [{ left: 69, top: 76 }, { left: 81, top: 76 }] },
    git: { title: "Git / GitHub Wing", left: 36, top: 8, width: 20, height: 18, slots: [{ left: 42, top: 16 }, { left: 51, top: 16 }] },
    tools: { title: "General Tools Wing", left: 36, top: 70, width: 20, height: 18, slots: [{ left: 42, top: 78 }, { left: 51, top: 78 }] },
  };
  const groupedToolRooms = toolRooms.reduce((map, room) => {
    const key = room.category?.key ?? "tools";
    map.set(key, [...(map.get(key) ?? []), room]);
    return map;
  }, new Map());
  const toolWings = [...groupedToolRooms.entries()].map(([key, rooms]) => ({
    key,
    title: rooms[0]?.category?.title ?? toolWingLayouts[key]?.title ?? "General Tools Wing",
    layout: toolWingLayouts[key] ?? toolWingLayouts.tools,
    rooms,
  }));
  const rooms = [
    {
      id: "human-hall",
      kind: "human",
      eyebrow: "Human",
      title: "Briefing Hall",
      copy: "用户在这里提问、打断、确认方向。",
      icon: "human",
      left: 8,
      top: 52,
    },
    {
      id: "llm-core",
      kind: "llm",
      eyebrow: "LLM",
      title: "Reasoning Core",
      copy: "Agent 在这里思考、整理方案、决定下一步。",
      icon: "llm",
      left: 39,
      top: 22,
    },
    ...toolWings.flatMap(({ title, layout, rooms }) =>
      rooms.map((room, index) => {
        const slot = layout.slots[index % layout.slots.length];
        return {
          id: room.id,
          kind: "tool",
          eyebrow: title,
          title: `${room.title} Room`,
          copy: `${room.title} 在 ${title} 里独立执行。`,
          icon: "tool",
          left: slot.left,
          top: slot.top + Math.floor(index / layout.slots.length) * 10,
          toolName: room.toolName,
        };
      }),
    ),
  ];
  const wings = [
    { kind: "human", title: "Human Wing", left: 3, top: 40, width: 22, height: 32 },
    { kind: "llm", title: "Reasoning Wing", left: 28, top: 4, width: 28, height: 28 },
    ...toolWings.map(({ key, title, layout }) => ({
      kind: key,
      title,
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
    })),
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${payload.title} · Session Story</title>
  <style>
    :root {
      --bg: #efe7d3;
      --panel: rgba(255, 251, 242, 0.92);
      --ink: #231f19;
      --muted: #71695d;
      --line: #2d2a24;
      --human: #d97a4a;
      --llm: #6d7fa4;
      --tool: #9a8f55;
      --agent: #5d7c6f;
      --path: #9d875f;
      --shadow: 8px 8px 0 rgba(35,31,25,0.16);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at 20% 0%, rgba(255,255,255,0.5), transparent 24%),
        linear-gradient(180deg, #f0e7d0 0%, #e1d5bc 100%);
      color: var(--ink);
      font-family: "Courier New", Consolas, monospace;
    }
    body { padding: 20px; }
    .shell { max-width: min(1800px, 98vw); margin: 0 auto; display: grid; gap: 16px; }
    .header, .panel {
      background: var(--panel);
      border: 3px solid var(--line);
      box-shadow: var(--shadow);
    }
    .header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .title { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { font-size: 13px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
    .layout {
      display: grid;
      grid-template-columns: minmax(780px, 1.9fr) minmax(260px, 0.62fr);
      gap: 16px;
    }
    .stage-panel { padding: 10px; }
    .stage {
      position: relative;
      height: min(90vh, 1080px);
      min-height: 820px;
      overflow: hidden;
      border: 3px solid var(--line);
      background:
        radial-gradient(circle at 50% 15%, rgba(255,255,255,0.48), transparent 24%),
        linear-gradient(180deg, #efe5b9 0%, #d9ccab 42%, #c6b18c 42%, #c6b18c 100%);
      perspective: 1200px;
      isolation: isolate;
    }
    .stage-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(45,42,36,0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(45,42,36,0.07) 1px, transparent 1px);
      background-size: 28px 28px;
      opacity: 0.55;
    }
    .map-floor {
      position: absolute;
      inset: 6% 3% 10%;
      transform: rotateX(62deg);
      transform-origin: center center;
      border: 3px solid rgba(45,42,36,0.3);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.06)),
        linear-gradient(90deg, rgba(255,255,255,0.06), rgba(0,0,0,0.03));
      box-shadow: 0 40px 80px rgba(35,31,25,0.18);
      z-index: 0;
    }
    .corridor {
      position: absolute;
      height: 34px;
      border: 3px solid rgba(45,42,36,0.38);
      background: linear-gradient(90deg, #bea57d, #d1bb92);
      box-shadow: 0 8px 0 rgba(35,31,25,0.08);
      z-index: 1;
    }
    .corridor-main { left: 16%; top: 66%; width: 68%; }
    .corridor-spine { left: 47%; top: 33%; width: 18%; transform: rotate(90deg); }
    .corridor-tool-a { left: 62%; top: 29%; width: 21%; }
    .corridor-tool-b { left: 62%; top: 48%; width: 21%; }
    .wing {
      position: absolute;
      border: 3px dashed rgba(45,42,36,0.28);
      background: rgba(255,255,255,0.08);
      border-radius: 24px;
      z-index: 1;
      box-shadow: inset 0 0 0 8px rgba(255,255,255,0.04);
    }
    .wing-label {
      position: absolute;
      left: 12px;
      top: 10px;
      padding: 6px 10px;
      border: 2px solid var(--line);
      background: rgba(255,251,242,0.9);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .room {
      position: absolute;
      width: 280px;
      height: 220px;
      transform: translate(-50%, -50%);
      z-index: 2;
    }
    .room-face {
      position: relative;
      width: 100%;
      height: 100%;
      border: 3px solid var(--line);
      background: rgba(255,251,241,0.94);
      box-shadow: var(--shadow);
      padding: 18px;
    }
    .room-face::before, .room-face::after {
      content: "";
      position: absolute;
      background: rgba(35,31,25,0.12);
    }
    .room-face::before {
      left: 12px;
      right: -18px;
      bottom: -18px;
      height: 18px;
      border: 3px solid var(--line);
      border-top: none;
      transform: skewX(-45deg);
      transform-origin: left top;
    }
    .room-face::after {
      top: 12px;
      right: -18px;
      bottom: -18px;
      width: 18px;
      border: 3px solid var(--line);
      border-left: none;
      transform: skewY(-45deg);
      transform-origin: left top;
    }
    .room-human .room-face { background: rgba(255, 238, 226, 0.96); }
    .room-llm .room-face { background: rgba(232, 238, 252, 0.96); }
    .room-tool .room-face { background: rgba(248, 240, 212, 0.96); }
    .room-eyebrow { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .room-title { margin-top: 8px; font-size: 26px; font-weight: 700; }
    .room-copy { margin-top: 12px; font-size: 15px; line-height: 1.48; max-width: 165px; }
    .room-door {
      position: absolute;
      left: calc(50% - 22px);
      bottom: 0;
      width: 44px;
      height: 64px;
      background: rgba(35,31,25,0.14);
      border: 3px solid var(--line);
      border-bottom: none;
    }
    .room-icon {
      position: absolute;
      right: 20px;
      top: 28px;
      width: 64px;
      height: 64px;
      border: 3px solid var(--line);
      background: #fff9e8;
    }
    .room-icon-human::before, .room-icon-human::after,
    .room-icon-llm::before, .room-icon-llm::after,
    .room-icon-tool::before, .room-icon-tool::after {
      content: "";
      position: absolute;
      background: var(--line);
    }
    .room-icon-human::before { left: 24px; top: 8px; width: 10px; height: 44px; }
    .room-icon-human::after { left: 8px; top: 24px; width: 44px; height: 10px; }
    .room-icon-llm::before { inset: 10px; border: 3px solid var(--line); background: transparent; }
    .room-icon-llm::after { left: 24px; top: 24px; width: 10px; height: 10px; box-shadow: -14px 0 0 var(--llm), 14px 0 0 var(--llm), 0 14px 0 var(--llm); background: var(--llm); }
    .room-icon-tool::before { left: 10px; top: 28px; width: 42px; height: 10px; }
    .room-icon-tool::after { left: 26px; top: 10px; width: 10px; height: 42px; }
    .room.active { z-index: 4; }
    .runner-layer {
      position: absolute;
      inset: 0;
      z-index: 5;
      pointer-events: none;
    }
    .runner {
      position: absolute;
      left: 80px;
      top: 72%;
      width: 110px;
      height: 170px;
      transform-origin: 50% 100%;
      filter: drop-shadow(6px 9px 0 rgba(35,31,25,0.18));
    }
    .runner-shadow {
      position: absolute;
      left: 24px;
      bottom: 2px;
      width: 62px;
      height: 14px;
      border-radius: 999px;
      background: rgba(35,31,25,0.18);
    }
    .runner-head {
      position: absolute;
      left: 28px;
      top: 12px;
      width: 46px;
      height: 46px;
      background: #faedcd;
      border: 3px solid var(--line);
    }
    .runner-body {
      position: absolute;
      left: 22px;
      top: 58px;
      width: 54px;
      height: 54px;
      border: 3px solid var(--line);
      background: var(--agent);
      box-shadow:
        -18px 8px 0 -2px var(--agent),
        18px 8px 0 -2px var(--agent);
    }
    .runner-eye {
      position: absolute;
      top: 28px;
      width: 5px;
      height: 5px;
      background: var(--line);
    }
    .runner-eye.left { left: 42px; }
    .runner-eye.right { left: 58px; }
    .runner-leg {
      position: absolute;
      top: 112px;
      width: 14px;
      height: 42px;
      background: #3f342b;
      transform-origin: 50% 0%;
    }
    .runner-leg.left { left: 34px; }
    .runner-leg.right { left: 56px; }
    .runner.walking .runner-leg.left { animation: leg-left 0.24s linear infinite; }
    .runner.walking .runner-leg.right { animation: leg-right 0.24s linear infinite; }
    .runner.walking .runner-body { animation: torso-bob 0.24s linear infinite; }
    .runner-badge {
      position: absolute;
      left: 10px;
      top: -10px;
      padding: 5px 9px;
      border: 2px solid var(--line);
      background: rgba(255,251,242,0.94);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .bubble {
      position: absolute;
      width: 360px;
      padding: 14px 16px;
      border: 3px solid var(--line);
      background: rgba(255,251,242,0.96);
      box-shadow: var(--shadow);
      font-size: 16px;
      line-height: 1.55;
      opacity: 0;
      transform: translateY(8px);
    }
    .bubble::after {
      content: "";
      position: absolute;
      left: 28px;
      bottom: -14px;
      width: 22px;
      height: 22px;
      background: inherit;
      border-right: 3px solid var(--line);
      border-bottom: 3px solid var(--line);
      transform: rotate(45deg);
    }
    .route-log {
      position: absolute;
      left: 22px;
      top: 22px;
      padding: 10px 12px;
      border: 3px solid var(--line);
      background: rgba(255,251,242,0.92);
      font-size: 14px;
      z-index: 6;
    }
    .sidebar { display: grid; gap: 16px; align-content: start; }
    .panel { padding: 14px; }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    button, select {
      border: 2px solid var(--line);
      background: #fff9e9;
      color: var(--ink);
      padding: 8px 10px;
      font: inherit;
      cursor: pointer;
      box-shadow: 3px 3px 0 rgba(33,31,25,0.12);
    }
    .event-card { min-height: 164px; }
    .eyebrow { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .event-label { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
    .event-text { line-height: 1.6; white-space: pre-wrap; }
    .timeline { max-height: 520px; overflow: auto; display: grid; gap: 10px; padding-right: 4px; }
    .timeline-item {
      padding: 10px 12px;
      border: 2px solid var(--line);
      background: rgba(255,255,255,0.65);
      cursor: pointer;
      text-align: left;
    }
    .timeline-item.active { background: #fff1c6; transform: translateX(4px); }
    .timeline-type { font-size: 12px; color: var(--muted); text-transform: uppercase; }
    .timeline-text { margin-top: 6px; line-height: 1.45; }
    @keyframes leg-left {
      0% { transform: rotate(20deg); }
      50% { transform: rotate(-20deg); }
      100% { transform: rotate(20deg); }
    }
    @keyframes leg-right {
      0% { transform: rotate(-20deg); }
      50% { transform: rotate(20deg); }
      100% { transform: rotate(-20deg); }
    }
    @keyframes torso-bob {
      0% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
      100% { transform: translateY(0); }
    }
    @media (max-width: 980px) {
      body { padding: 14px; }
      .layout { grid-template-columns: 1fr; }
      .stage { height: min(88vh, 920px); min-height: 720px; }
      .room { width: 220px; height: 176px; }
      .room-title { font-size: 21px; }
      .room-copy { font-size: 13px; max-width: 130px; }
      .bubble { width: 300px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="header">
      <div>
        <div class="title">${payload.title} · Session Story</div>
        <div class="meta">
          <span>source: ${payload.sourceAgent}</span>
          <span>session: ${payload.sessionId}</span>
          <span>cwd: ${payload.cwd}</span>
        </div>
      </div>
      <div class="meta">
        <span>map rooms: human + llm + ${toolRooms.length} tool rooms</span>
        <span>motion: Anime.js</span>
        <span>renderer: DOM + PixiJS loaded</span>
      </div>
    </section>
    <section class="layout">
      <div class="panel stage-panel">
        <div id="stage" class="stage">
          <div class="stage-grid"></div>
          <div class="map-floor"></div>
          ${wings.map(wingMarkup).join("")}
          <div class="corridor corridor-main"></div>
          <div class="corridor corridor-spine"></div>
          <div class="corridor corridor-tool-a"></div>
          <div class="corridor corridor-tool-b"></div>
          <div id="route-log" class="route-log">Agent enters the map.</div>
          ${rooms.map(roomMarkup).join("")}
          <div class="runner-layer">
            <div id="runner" class="runner">
              <div class="runner-badge">AGENT</div>
              <div class="runner-shadow"></div>
              <div class="runner-head"></div>
              <div class="runner-body"></div>
              <div class="runner-eye left"></div>
              <div class="runner-eye right"></div>
              <div class="runner-leg left"></div>
              <div class="runner-leg right"></div>
            </div>
            <div id="bubble" class="bubble"></div>
          </div>
        </div>
      </div>
      <div class="sidebar">
        <section class="panel">
          <div class="eyebrow">Playback</div>
          <div class="controls">
            <button id="play-button" type="button">Play</button>
            <button id="replay-button" type="button">Replay</button>
            <button id="pause-button" type="button">Pause</button>
            <button id="prev-button" type="button">Prev</button>
            <button id="next-button" type="button">Next</button>
            <select id="speed-select" aria-label="Playback speed">
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
            </select>
          </div>
        </section>
        <section class="panel event-card">
          <div class="eyebrow">Current Beat</div>
          <div id="event-label" class="event-label">Ready</div>
          <div id="event-text" class="event-text">The agent is waiting for the first route.</div>
        </section>
        <section class="panel">
          <div class="eyebrow">Timeline</div>
          <div id="timeline" class="timeline"></div>
        </section>
      </div>
    </section>
  </div>

  <script id="story-data" type="application/json">${serialized}</script>
  <script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
  <script>
    (function () {
      const story = JSON.parse(document.getElementById("story-data").textContent);
      const stageElement = document.getElementById("stage");
      const runnerElement = document.getElementById("runner");
      const bubbleElement = document.getElementById("bubble");
      const routeLogElement = document.getElementById("route-log");
      const timelineElement = document.getElementById("timeline");
      const eventLabel = document.getElementById("event-label");
      const eventText = document.getElementById("event-text");
      const playButton = document.getElementById("play-button");
      const replayButton = document.getElementById("replay-button");
      const pauseButton = document.getElementById("pause-button");
      const prevButton = document.getElementById("prev-button");
      const nextButton = document.getElementById("next-button");
      const speedSelect = document.getElementById("speed-select");
      const events = Array.isArray(story.events) ? story.events : [];
      let activeIndex = -1;
      let playbackTimer = null;
      let playbackRate = 1;
      let runnerState = { x: 72, y: 74, scale: 1 };

      function summarize(text) {
        if (!text) return "";
        return text.length > 96 ? text.slice(0, 93) + "..." : text;
      }

      function roomForEvent(event) {
        if (event.type === "user" || event.type === "assistant") {
          return "human-hall";
        }
        if (event.type === "reasoning" || event.type === "commentary") {
          return "llm-core";
        }
        if (event.type === "tool_call" || event.type === "tool_result") {
          const match = (story.toolRooms || []).find((room) => room.toolName === event.toolName);
          return match ? match.id : "tool-workshop";
        }
        return "llm-core";
      }

      function roomTarget(roomId) {
        const room = stageElement.querySelector('[data-room-id="' + roomId + '"]');
        const stageRect = stageElement.getBoundingClientRect();
        const roomRect = room.getBoundingClientRect();
        const x = roomRect.left - stageRect.left + roomRect.width / 2 - runnerElement.offsetWidth / 2;
        const y = roomRect.top - stageRect.top + roomRect.height - 54;
        const normalized = Math.min(1, Math.max(0, y / stageRect.height));
        const scale = 0.8 + normalized * 0.34;
        return { room, x, y, scale };
      }

      function applyRunnerState() {
        runnerElement.style.left = runnerState.x + "px";
        runnerElement.style.top = runnerState.y + "px";
        const direction = runnerElement.dataset.direction || "1";
        runnerElement.style.transform = "scale(" + direction + "," + runnerState.scale + ")";
      }

      function setBubble(text, tone) {
        bubbleElement.textContent = summarize(text);
        bubbleElement.style.left = Math.max(18, Math.min(stageElement.clientWidth - 280, runnerState.x - 80)) + "px";
        bubbleElement.style.top = Math.max(18, runnerState.y - 86) + "px";
        bubbleElement.style.background = tone === "human"
          ? "rgba(255, 239, 229, 0.96)"
          : tone === "tool"
            ? "rgba(250, 242, 214, 0.96)"
            : "rgba(234, 240, 253, 0.96)";
        anime.remove(bubbleElement);
        anime({
          targets: bubbleElement,
          opacity: [0, 1],
          translateY: [8, 0],
          duration: 220,
          easing: "easeOutQuad",
        });
      }

      function highlightRoom(roomId) {
        stageElement.querySelectorAll(".room").forEach((node) => {
          node.classList.toggle("active", node.dataset.roomId === roomId);
        });
      }

      function moveRunner(roomId, immediate) {
        const target = roomTarget(roomId);
        const direction = target.x < runnerState.x ? "-1" : "1";
        runnerElement.dataset.direction = direction;
        highlightRoom(roomId);

        if (immediate) {
          runnerState = { x: target.x, y: target.y, scale: target.scale };
          applyRunnerState();
          return;
        }

        runnerElement.classList.add("walking");
        anime.remove(runnerState);
        anime({
          targets: runnerState,
          x: target.x,
          y: target.y,
          scale: target.scale,
          duration: 900,
          easing: "easeInOutQuad",
          update: applyRunnerState,
          complete() {
            runnerElement.classList.remove("walking");
          },
        });
      }

      function renderTimeline() {
        timelineElement.replaceChildren();
        events.forEach((event, index) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "timeline-item";
          item.dataset.index = String(index);
          item.innerHTML = '<div class="timeline-type">' + event.label + '</div><div class="timeline-text">' + summarize(event.text) + '</div>';
          item.addEventListener("click", () => showEvent(index, { immediate: false }));
          timelineElement.appendChild(item);
        });
      }

      function highlightTimeline(index) {
        timelineElement.querySelectorAll(".timeline-item").forEach((node) => {
          node.classList.toggle("active", Number(node.dataset.index) === index);
        });
      }

      function routeLine(event, roomId) {
        const room = stageElement.querySelector('[data-room-id="' + roomId + '"]');
        const roomTitle = room.querySelector(".room-title")?.textContent || roomId;
        return "Agent -> " + roomTitle + " -> " + event.label;
      }

      function toneForEvent(event) {
        if (event.type === "user" || event.type === "assistant") return "human";
        if (event.type === "tool_call" || event.type === "tool_result") return "tool";
        return "llm";
      }

      function showEvent(index, options = {}) {
        if (index < 0 || index >= events.length) return;
        activeIndex = index;
        const event = events[index];
        const roomId = roomForEvent(event);
        eventLabel.textContent = event.label;
        eventText.textContent = event.text;
        routeLogElement.textContent = routeLine(event, roomId);
        highlightTimeline(index);
        moveRunner(roomId, options.immediate === true);
        setTimeout(() => {
          setBubble(event.text, toneForEvent(event));
          runnerElement.classList.add("talking");
          setTimeout(() => runnerElement.classList.remove("talking"), 380);
        }, options.immediate === true ? 0 : 660);
      }

      function step(delta) {
        if (events.length === 0) return;
        const next = activeIndex < 0 ? 0 : Math.max(0, Math.min(events.length - 1, activeIndex + delta));
        showEvent(next, { immediate: false });
      }

      function schedulePlayback() {
        clearTimeout(playbackTimer);
        if (activeIndex >= events.length - 1) return;
        playbackTimer = setTimeout(() => {
          step(1);
          schedulePlayback();
        }, 2200 / playbackRate);
      }

      function replayFromStart() {
        clearTimeout(playbackTimer);
        if (events.length === 0) return;
        showEvent(0, { immediate: false });
        setTimeout(schedulePlayback, 900 / playbackRate);
      }

      function startIdle() {
        let phase = 0;
        function tick() {
          phase += 0.08;
          if (!runnerElement.classList.contains("walking")) {
            runnerElement.style.marginTop = Math.sin(phase) * 3 + "px";
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }

      playButton.addEventListener("click", schedulePlayback);
      replayButton.addEventListener("click", replayFromStart);
      pauseButton.addEventListener("click", () => clearTimeout(playbackTimer));
      prevButton.addEventListener("click", () => step(-1));
      nextButton.addEventListener("click", () => step(1));
      speedSelect.addEventListener("change", () => {
        playbackRate = Number(speedSelect.value) || 1;
        if (playbackTimer) schedulePlayback();
      });
      window.addEventListener("resize", () => {
        if (activeIndex >= 0) {
          moveRunner(roomForEvent(events[activeIndex]), true);
          setBubble(events[activeIndex].text, toneForEvent(events[activeIndex]));
        }
      });

      renderTimeline();
      applyRunnerState();
      startIdle();
      if (events[0]) {
        showEvent(0, { immediate: true });
      }
      if (events.length > 1) {
        setTimeout(schedulePlayback, 500);
      }
    })();
  </script>
</body>
</html>`;
}

export function renderSessionStoryHtmlExport({ session, sourceAgent, targetAgent }) {
  const payload = buildStoryPayload(session, { sourceAgent, targetAgent });
  return {
    mode: "session-story-html",
    sessionId: session.sessionId,
    files: [
      {
        key: "main",
        fileName: `${sanitizeFileToken(payload.sessionId || payload.title)}-story.html`,
        content: renderStoryHtml(payload),
      },
    ],
  };
}
