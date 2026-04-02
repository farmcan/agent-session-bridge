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
  const roomsSerialized = escapeForScript(rooms);
  const wingsSerialized = escapeForScript(wings);

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
      grid-template-columns: minmax(980px, 2.5fr) minmax(240px, 0.52fr);
      gap: 16px;
    }
    .stage-panel { padding: 10px; }
    .stage {
      position: relative;
      height: min(92vh, 1120px);
      min-height: 880px;
      overflow: hidden;
      border: 3px solid var(--line);
      background:
        radial-gradient(circle at 50% 15%, rgba(255,255,255,0.48), transparent 24%),
        linear-gradient(180deg, #efe5b9 0%, #d9ccab 42%, #c6b18c 42%, #c6b18c 100%);
      isolation: isolate;
    }
    .phaser-stage {
      position: absolute;
      inset: 0;
      z-index: 0;
    }
    .phaser-stage canvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    .bubble {
      position: absolute;
      width: 280px;
      padding: 10px 12px;
      border: 3px solid var(--line);
      background: rgba(255,251,242,0.96);
      box-shadow: var(--shadow);
      font-size: 14px;
      line-height: 1.45;
      opacity: 0;
      transform: translateY(8px);
    }
    .bubble::after {
      content: "";
      position: absolute;
      left: 20px;
      bottom: -12px;
      width: 18px;
      height: 18px;
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
    .timeline { max-height: 460px; overflow: auto; display: grid; gap: 10px; padding-right: 4px; }
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
    @media (max-width: 980px) {
      body { padding: 14px; }
      .layout { grid-template-columns: 1fr; }
      .stage { height: min(88vh, 980px); min-height: 760px; }
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
        <span>renderer: Phaser hybrid stage</span>
      </div>
    </section>
    <section class="layout">
      <div class="panel stage-panel">
        <div id="stage" class="stage">
          <div id="phaser-stage" class="phaser-stage"></div>
          <div id="route-log" class="route-log">Agent enters the map.</div>
          <div id="bubble" class="bubble"></div>
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
  <script id="story-rooms" type="application/json">${roomsSerialized}</script>
  <script id="story-wings" type="application/json">${wingsSerialized}</script>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
  <script>
    (function () {
      const story = JSON.parse(document.getElementById("story-data").textContent);
      const roomLayout = JSON.parse(document.getElementById("story-rooms").textContent);
      const wingLayout = JSON.parse(document.getElementById("story-wings").textContent);
      const stageElement = document.getElementById("stage");
      const phaserStageElement = document.getElementById("phaser-stage");
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
      const beats = Array.isArray(story.beats) && story.beats.length > 0 ? story.beats : (Array.isArray(story.events) ? story.events : []);
      let activeIndex = -1;
      let playbackTimer = null;
      let playbackRate = 1;
      let phaserApi = null;
      let phaserGame = null;

      function summarize(text) {
        if (!text) return "";
        return text.length > 96 ? text.slice(0, 93) + "..." : text;
      }

      function roomForBeat(beat) {
        return beat.roomId || "llm-core";
      }

      function setBubble(text, tone) {
        bubbleElement.textContent = summarize(text);
        const anchor = phaserApi?.getBubbleAnchor?.() ?? { x: 140, y: 240 };
        bubbleElement.style.left = Math.max(18, Math.min(stageElement.clientWidth - 300, anchor.x - 94)) + "px";
        bubbleElement.style.top = Math.max(18, anchor.y - 92) + "px";
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

      function moveRunner(roomId, immediate) {
        phaserApi?.moveRunner(roomId, immediate);
      }

      function renderTimeline() {
        timelineElement.replaceChildren();
        beats.forEach((beat, index) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "timeline-item";
          item.dataset.index = String(index);
          item.innerHTML = '<div class="timeline-type">' + beat.label + '</div><div class="timeline-text">' + summarize(beat.text) + '</div>';
          item.addEventListener("click", () => showEvent(index, { immediate: false }));
          timelineElement.appendChild(item);
        });
      }

      function highlightTimeline(index) {
        timelineElement.querySelectorAll(".timeline-item").forEach((node) => {
          node.classList.toggle("active", Number(node.dataset.index) === index);
        });
      }

      function routeLine(beat, roomId) {
        const room = roomLayout.find((entry) => entry.id === roomId);
        const roomTitle = room?.title || roomId;
        return "Agent -> " + roomTitle + " -> " + beat.label;
      }

      function toneForBeat(beat) {
        if (beat.roomId === "human-hall") return "human";
        if (String(beat.roomId || "").startsWith("tool-")) return "tool";
        return "llm";
      }

      function showEvent(index, options = {}) {
        if (index < 0 || index >= beats.length) return;
        activeIndex = index;
        const beat = beats[index];
        const roomId = roomForBeat(beat);
        eventLabel.textContent = beat.label;
        eventText.textContent = beat.text;
        routeLogElement.textContent = routeLine(beat, roomId);
        highlightTimeline(index);
        moveRunner(roomId, options.immediate === true);
        setTimeout(() => {
          setBubble(beat.text, toneForBeat(beat));
          phaserApi?.pulseRunner();
        }, options.immediate === true ? 0 : 660);
      }

      function step(delta) {
        if (beats.length === 0) return;
        const next = activeIndex < 0 ? 0 : Math.max(0, Math.min(beats.length - 1, activeIndex + delta));
        showEvent(next, { immediate: false });
      }

      function schedulePlayback() {
        clearTimeout(playbackTimer);
        if (activeIndex >= beats.length - 1) return;
        playbackTimer = setTimeout(() => {
          step(1);
          schedulePlayback();
        }, 1800 / playbackRate);
      }

      function replayFromStart() {
        clearTimeout(playbackTimer);
        if (beats.length === 0) return;
        showEvent(0, { immediate: false });
        setTimeout(schedulePlayback, 720 / playbackRate);
      }

      function startIdle() {
        let phase = 0;
        function tick() {
          phase += 0.08;
          phaserApi?.setIdleOffset(Math.sin(phase) * 3);
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }

      function createPhaserStage() {
        phaserGame?.destroy(true);
        phaserStageElement.replaceChildren();
        const width = phaserStageElement.clientWidth || stageElement.clientWidth;
        const height = phaserStageElement.clientHeight || stageElement.clientHeight;
        const roomNodes = new Map();
        const corridorNodes = [];
        let sceneRef = null;
        let runner = null;
        let runnerShadow = null;
        let runnerPulse = null;
        let idleOffset = 0;
        let activeRoomId = null;

        function worldX(percent) {
          return (percent / 100) * width;
        }

        function worldY(percent) {
          return (percent / 100) * height;
        }

        function baseRunnerPosition(roomId) {
          const room = roomNodes.get(roomId);
          if (room) {
            return { x: room.door.x, y: room.door.y + 52 };
          }
          return { x: width * 0.12, y: height * 0.74 };
        }

        function applyIdlePosition() {
          if (!runner || !runnerShadow) return;
          const base = baseRunnerPosition(activeRoomId);
          runner.setPosition(base.x, base.y + idleOffset);
          runnerShadow.setPosition(base.x, base.y + 52);
        }

        const config = {
          type: Phaser.AUTO,
          parent: "phaser-stage",
          width,
          height,
          backgroundColor: "#00000000",
          render: { pixelArt: true, antialias: false },
          scene: {
            create() {
              const scene = this;
              sceneRef = scene;
              scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);
              scene.add.rectangle(width / 2, height * 0.84, width * 0.96, height * 0.32, 0xb99664, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.63, width * 0.84, height * 0.42, 0xd5bc90, 1).setDepth(0);

              wingLayout.forEach((wing) => {
                const rect = scene.add.rectangle(
                  worldX(wing.left) + worldX(wing.width) / 2,
                  worldY(wing.top) + worldY(wing.height) / 2,
                  worldX(wing.width),
                  worldY(wing.height),
                  0xffffff,
                  0.08,
                ).setStrokeStyle(3, 0x5a4a33, 0.2).setDepth(1);
                const label = scene.add.text(rect.x - rect.width / 2 + 14, rect.y - rect.height / 2 + 10, wing.title, {
                  fontFamily: "Courier New",
                  fontSize: "18px",
                  color: "#231f19",
                  fontStyle: "bold",
                  backgroundColor: "#fffaf0",
                  padding: { x: 8, y: 6 },
                }).setDepth(2);
                rect.label = label;
              });

              [
                { x: width * 0.5, y: height * 0.71, w: width * 0.68, h: 28 },
                { x: width * 0.56, y: height * 0.43, w: width * 0.26, h: 28, angle: 90 },
                { x: width * 0.74, y: height * 0.31, w: width * 0.22, h: 28 },
                { x: width * 0.74, y: height * 0.52, w: width * 0.22, h: 28 },
              ].forEach((corridor) => {
                const shadow = scene.add.rectangle(corridor.x, corridor.y + 8, corridor.w, corridor.h, 0x8a6f47, 0.18).setDepth(1);
                const line = scene.add.rectangle(corridor.x, corridor.y, corridor.w, corridor.h, 0xd7b98a, 1)
                  .setStrokeStyle(3, 0x6a5739, 0.4)
                  .setDepth(2);
                if (corridor.angle) {
                  line.angle = corridor.angle;
                  shadow.angle = corridor.angle;
                }
                corridorNodes.push(line, shadow);
              });

              roomLayout.forEach((room) => {
                const x = worldX(room.left);
                const y = worldY(room.top);
                const color = room.kind === "human" ? 0xffeee5 : room.kind === "llm" ? 0xeaf0fd : 0xf6ecd2;
                scene.add.rectangle(x + 14, y + 18, 286, 208, 0x3a2d20, 0.12).setDepth(2);
                const face = scene.add.rectangle(x, y, 286, 208, color, 1).setStrokeStyle(3, 0x2d2a24, 1).setDepth(3);
                const roof = scene.add.rectangle(x, y - 96, 286, 24, 0xffffff, 0.24).setDepth(4);
                const title = scene.add.text(x - 116, y - 56, room.title, {
                  fontFamily: "Courier New",
                  fontSize: "24px",
                  fontStyle: "bold",
                  color: "#231f19",
                  wordWrap: { width: 176 },
                }).setDepth(4);
                const eyebrow = scene.add.text(x - 116, y - 82, room.eyebrow, {
                  fontFamily: "Courier New",
                  fontSize: "13px",
                  color: "#71695d",
                }).setDepth(4);
                const icon = room.kind === "human"
                  ? scene.add.circle(x + 96, y - 54, 16, 0xd97a4a, 1).setStrokeStyle(3, 0x2d2a24, 1)
                  : room.kind === "llm"
                    ? scene.add.star(x + 96, y - 54, 4, 10, 18, 0x6d7fa4, 1).setStrokeStyle(3, 0x2d2a24, 1)
                    : scene.add.rectangle(x + 96, y - 54, 28, 28, 0x9a8f55, 1).setStrokeStyle(3, 0x2d2a24, 1);
                icon.setDepth(4);
                const door = scene.add.rectangle(x, y + 76, 42, 58, 0x7c6648, 0.32).setStrokeStyle(3, 0x2d2a24, 1).setDepth(5);
                roomNodes.set(room.id, { x, y, title: room.title, face, roof, titleNode: title, eyebrow, door, icon });
              });

              runnerShadow = scene.add.ellipse(width * 0.12, height * 0.78, 56, 18, 0x000000, 0.18).setDepth(5);
              runner = scene.add.container(width * 0.12, height * 0.74);
              const head = scene.add.rectangle(0, -40, 38, 38, 0xfaedcd, 1).setStrokeStyle(3, 0x2d2a24, 1);
              const body = scene.add.rectangle(0, 8, 46, 46, 0x5d7c6f, 1).setStrokeStyle(3, 0x2d2a24, 1);
              const armL = scene.add.rectangle(-30, 14, 14, 32, 0x5d7c6f, 1);
              const armR = scene.add.rectangle(30, 14, 14, 32, 0x5d7c6f, 1);
              const legL = scene.add.rectangle(-12, 56, 12, 36, 0x3f342b, 1);
              const legR = scene.add.rectangle(12, 56, 12, 36, 0x3f342b, 1);
              const eyeL = scene.add.rectangle(-8, -42, 4, 4, 0x2d2a24, 1);
              const eyeR = scene.add.rectangle(8, -42, 4, 4, 0x2d2a24, 1);
              runner.add([armL, armR, body, head, legL, legR, eyeL, eyeR]);
              runner.setDepth(6);
              activeRoomId = null;
              applyIdlePosition();

              phaserApi = {
                moveRunner(roomId, immediate) {
                  const target = roomNodes.get(roomId);
                  if (!target || !runner || !runnerShadow || !sceneRef) return;
                  activeRoomId = roomId;
                  roomNodes.forEach((node) => {
                    node.face.setStrokeStyle(3, 0x2d2a24, 1);
                    node.roof.fillAlpha = 0.24;
                    node.titleNode.setScale(1);
                    node.icon.setScale(1);
                  });
                  target.face.setStrokeStyle(5, 0xd97a4a, 1);
                  target.roof.fillAlpha = 0.4;
                  target.titleNode.setScale(1.04);
                  target.icon.setScale(1.08);
                  const targetX = target.door.x;
                  const targetY = target.door.y + 52;
                  runner.scaleX = target.x < runner.x ? -1 : 1;
                  if (immediate) {
                    runner.setPosition(targetX, targetY + idleOffset);
                    runnerShadow.setPosition(targetX, targetY + 52);
                    return;
                  }
                  sceneRef.tweens.killTweensOf([runner, runnerShadow]);
                  sceneRef.tweens.add({
                    targets: runnerShadow,
                    x: targetX,
                    y: targetY + 52,
                    duration: 900,
                    ease: "Quad.easeInOut",
                  });
                  sceneRef.tweens.add({
                    targets: runner,
                    x: targetX,
                    y: targetY,
                    duration: 900,
                    ease: "Quad.easeInOut",
                    onUpdate() {
                      runner.y += idleOffset;
                    },
                  });
                },
                pulseRunner() {
                  if (!runner || !sceneRef) return;
                  sceneRef.tweens.killTweensOf(runner);
                  if (runnerPulse) {
                    runnerPulse.stop();
                  }
                  runnerPulse = sceneRef.tweens.add({
                    targets: runner,
                    scaleX: runner.scaleX >= 0 ? 1.08 : -1.08,
                    scaleY: 1.08,
                    yoyo: true,
                    duration: 180,
                    repeat: 1,
                  });
                },
                setIdleOffset(offset) {
                  idleOffset = offset;
                  if (!runner || !sceneRef) return;
                  if (!sceneRef.tweens.isTweening(runner)) {
                    const base = baseRunnerPosition(activeRoomId);
                    runner.setPosition(base.x, base.y + idleOffset);
                    runnerShadow.setPosition(base.x, base.y + 52);
                  }
                },
                getBubbleAnchor() {
                  return runner ? { x: runner.x, y: runner.y } : { x: 140, y: 240 };
                },
              };
            },
          },
        };

        phaserGame = new Phaser.Game(config);
        return phaserGame;
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
        createPhaserStage();
        if (activeIndex >= 0) {
          moveRunner(roomForBeat(beats[activeIndex]), true);
          setBubble(beats[activeIndex].text, toneForBeat(beats[activeIndex]));
        }
      });

      createPhaserStage();
      renderTimeline();
      startIdle();
      if (beats[0]) {
        showEvent(0, { immediate: true });
      }
      if (beats.length > 1) {
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
