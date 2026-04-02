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
  const titleSerialized = escapeForScript(String(payload.title ?? "").slice(0, 64));
  const metaSerialized = escapeForScript(`source ${payload.sourceAgent}  session ${payload.sessionId}`);
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
      --ink: #f3e8c8;
      --line: #16110c;
      --panel: rgba(24, 18, 13, 0.76);
      --panel-strong: rgba(17, 13, 10, 0.92);
      --accent: #e6b85c;
      --accent-soft: #c28a3d;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #120d09;
      color: var(--ink);
      font-family: "Courier New", Consolas, monospace;
    }
    body { position: relative; }
    .stage {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 0%, rgba(232, 182, 80, 0.18), transparent 26%),
        linear-gradient(180deg, #1a120d 0%, #0f0a07 100%);
    }
    .phaser-stage {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .phaser-stage canvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    .controls {
      position: absolute;
      left: 20px;
      top: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      z-index: 4;
      padding: 10px 12px;
      border: 3px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(6px);
    }
    button, select {
      border: 2px solid var(--line);
      background: #f0dcb2;
      color: #24180f;
      padding: 8px 10px;
      font: inherit;
      cursor: pointer;
      min-width: 56px;
    }
    .caption {
      position: absolute;
      right: 20px;
      top: 20px;
      z-index: 4;
      padding: 8px 12px;
      border: 3px solid var(--line);
      background: var(--panel-strong);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #e7d6b2;
    }
    @media (max-width: 900px) {
      .controls {
        left: 12px;
        right: 12px;
        top: 12px;
      }
      .caption {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div id="stage" class="stage">
    <div id="phaser-stage" class="phaser-stage"></div>
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
    <div class="caption">Phaser Story Scene</div>
  </div>

  <script id="story-data" type="application/json">${serialized}</script>
  <script id="story-rooms" type="application/json">${roomsSerialized}</script>
  <script id="story-wings" type="application/json">${wingsSerialized}</script>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
  <script>
    (function () {
      const story = JSON.parse(document.getElementById("story-data").textContent);
      const sceneTitle = ${titleSerialized};
      const sceneMeta = ${metaSerialized};
      const roomLayout = JSON.parse(document.getElementById("story-rooms").textContent);
      const wingLayout = JSON.parse(document.getElementById("story-wings").textContent);
      const stageElement = document.getElementById("stage");
      const phaserStageElement = document.getElementById("phaser-stage");
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

      function moveRunner(roomId, immediate) {
        phaserApi?.moveRunner(roomId, immediate);
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
        phaserApi?.setHud({
          title: beat.label,
          text: beat.text,
          route: routeLine(beat, roomId),
          recent: beats.slice(Math.max(0, index - 3), index + 1),
          activeIndex: index,
        });
        moveRunner(roomId, options.immediate === true);
        setTimeout(() => {
          phaserApi?.showSpeech(beat.text, toneForBeat(beat));
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
        let sceneRef = null;
        let runner = null;
        let runnerShadow = null;
        let runnerPulse = null;
        let idleOffset = 0;
        let activeRoomId = null;
        let speechBubble = null;
        let speechText = null;
        let hudRoute = null;
        let hudTitle = null;
        let hudBody = null;
        let hudBeatItems = [];

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
              scene.add.rectangle(width / 2, height / 2, width, height, 0x120d09, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.14, width * 1.1, height * 0.34, 0x2f1d13, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.74, width * 1.1, height * 0.62, 0x3a2418, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.82, width * 0.96, height * 0.32, 0x6f5434, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.65, width * 0.86, height * 0.42, 0x97714a, 1).setDepth(0);
              scene.add.rectangle(width / 2, height * 0.94, width, height * 0.14, 0x493420, 1).setDepth(0);

              wingLayout.forEach((wing) => {
                const rect = scene.add.rectangle(
                  worldX(wing.left) + worldX(wing.width) / 2,
                  worldY(wing.top) + worldY(wing.height) / 2,
                  worldX(wing.width),
                  worldY(wing.height),
                  0x2a1c14,
                  0.45,
                ).setStrokeStyle(4, 0x8e693d, 0.65).setDepth(1);
                const label = scene.add.text(rect.x - rect.width / 2 + 14, rect.y - rect.height / 2 + 10, wing.title, {
                  fontFamily: "Courier New",
                  fontSize: "18px",
                  color: "#f0dcb2",
                  fontStyle: "bold",
                  backgroundColor: "#1b140f",
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
                scene.add.rectangle(corridor.x, corridor.y + 10, corridor.w, corridor.h + 8, 0x3c2b1b, 0.42).setDepth(1);
                const line = scene.add.rectangle(corridor.x, corridor.y, corridor.w, corridor.h, 0xb98954, 1)
                  .setStrokeStyle(4, 0x654226, 1)
                  .setDepth(2);
                if (corridor.angle) {
                  line.angle = corridor.angle;
                }
              });

              roomLayout.forEach((room) => {
                const x = worldX(room.left);
                const y = worldY(room.top);
                const color = room.kind === "human" ? 0xf3d2b5 : room.kind === "llm" ? 0xc8d5f0 : 0xe7d6ab;
                scene.add.rectangle(x + 18, y + 24, 300, 220, 0x1a130f, 0.45).setDepth(2);
                const face = scene.add.rectangle(x, y, 300, 220, color, 1).setStrokeStyle(4, 0x2d1d13, 1).setDepth(3);
                const roof = scene.add.rectangle(x, y - 102, 300, 28, 0xfff6df, 0.22).setDepth(4);
                const title = scene.add.text(x - 116, y - 56, room.title, {
                  fontFamily: "Courier New",
                  fontSize: "24px",
                  fontStyle: "bold",
                  color: "#2b1f15",
                  wordWrap: { width: 176 },
                }).setDepth(4);
                const eyebrow = scene.add.text(x - 116, y - 82, room.eyebrow, {
                  fontFamily: "Courier New",
                  fontSize: "13px",
                  color: "#6d5a42",
                }).setDepth(4);
                const icon = room.kind === "human"
                  ? scene.add.circle(x + 96, y - 54, 16, 0xd97a4a, 1).setStrokeStyle(4, 0x2d1d13, 1)
                  : room.kind === "llm"
                    ? scene.add.star(x + 96, y - 54, 4, 10, 18, 0x6d7fa4, 1).setStrokeStyle(4, 0x2d1d13, 1)
                    : scene.add.rectangle(x + 96, y - 54, 28, 28, 0x9a8f55, 1).setStrokeStyle(4, 0x2d1d13, 1);
                icon.setDepth(4);
                const door = scene.add.rectangle(x, y + 82, 48, 64, 0x6b4c30, 1).setStrokeStyle(4, 0x2d1d13, 1).setDepth(5);
                roomNodes.set(room.id, { x, y, title: room.title, face, roof, titleNode: title, eyebrow, door, icon });
              });

              const titleBar = scene.add.rectangle(width / 2, 42, Math.min(width * 0.52, 880), 52, 0x17110d, 0.92)
                .setStrokeStyle(4, 0xa87b43, 1)
                .setDepth(10);
              scene.add.text(titleBar.x - titleBar.width / 2 + 18, 27, sceneTitle, {
                fontFamily: "Courier New",
                fontSize: "20px",
                color: "#f1deba",
                fontStyle: "bold",
              }).setDepth(11);
              scene.add.text(titleBar.x - titleBar.width / 2 + 18, 51, sceneMeta, {
                fontFamily: "Courier New",
                fontSize: "12px",
                color: "#b99d74",
              }).setDepth(11);

              const routePanel = scene.add.rectangle(240, 118, 410, 42, 0x17110d, 0.86)
                .setStrokeStyle(4, 0x8b6538, 1)
                .setDepth(10);
              hudRoute = scene.add.text(routePanel.x - routePanel.width / 2 + 16, routePanel.y - 10, "Agent enters the map.", {
                fontFamily: "Courier New",
                fontSize: "14px",
                color: "#ead6af",
              }).setDepth(11);

              const currentPanel = scene.add.rectangle(280, height - 132, 468, 180, 0x17110d, 0.9)
                .setStrokeStyle(4, 0xa87b43, 1)
                .setDepth(10);
              hudTitle = scene.add.text(currentPanel.x - currentPanel.width / 2 + 18, currentPanel.y - 68, "Ready", {
                fontFamily: "Courier New",
                fontSize: "22px",
                color: "#f3e5c3",
                fontStyle: "bold",
              }).setDepth(11);
              hudBody = scene.add.text(currentPanel.x - currentPanel.width / 2 + 18, currentPanel.y - 28, "The agent is waiting for the first route.", {
                fontFamily: "Courier New",
                fontSize: "14px",
                color: "#cdb28a",
                wordWrap: { width: 432 },
                lineSpacing: 6,
              }).setDepth(11);

              const recentPanel = scene.add.rectangle(width - 210, height * 0.52, 360, Math.min(height * 0.58, 560), 0x17110d, 0.88)
                .setStrokeStyle(4, 0x8b6538, 1)
                .setDepth(10);
              scene.add.text(recentPanel.x - recentPanel.width / 2 + 16, recentPanel.y - recentPanel.height / 2 + 18, "Recent Beats", {
                fontFamily: "Courier New",
                fontSize: "18px",
                color: "#f2dfbc",
                fontStyle: "bold",
              }).setDepth(11);
              for (let index = 0; index < 4; index += 1) {
                const card = scene.add.rectangle(recentPanel.x, recentPanel.y - 150 + index * 92, 316, 72, 0x291d14, 0.96)
                  .setStrokeStyle(3, 0x6e4f2c, 1)
                  .setDepth(11);
                const label = scene.add.text(card.x - 142, card.y - 18, "", {
                  fontFamily: "Courier New",
                  fontSize: "12px",
                  color: "#f0d7aa",
                  fontStyle: "bold",
                }).setDepth(12);
                const body = scene.add.text(card.x - 142, card.y + 4, "", {
                  fontFamily: "Courier New",
                  fontSize: "12px",
                  color: "#c6aa80",
                  wordWrap: { width: 284 },
                }).setDepth(12);
                hudBeatItems.push({ card, label, body });
              }

              speechBubble = scene.add.container(0, 0).setDepth(20).setAlpha(0);
              const speechBg = scene.add.rectangle(0, 0, 260, 92, 0x17110d, 0.96).setStrokeStyle(4, 0xd9a057, 1);
              const speechPointer = scene.add.triangle(-76, 54, 0, 0, 18, 18, 36, 0, 0xd9a057, 1);
              speechPointer.setAngle(180);
              const pointerFill = scene.add.triangle(-76, 54, 4, 2, 18, 12, 32, 2, 0x17110d, 1);
              speechText = scene.add.text(-112, -28, "", {
                fontFamily: "Courier New",
                fontSize: "13px",
                color: "#f4e3c1",
                wordWrap: { width: 220 },
                lineSpacing: 4,
              });
              speechBubble.add([speechBg, speechPointer, pointerFill, speechText]);

              runnerShadow = scene.add.ellipse(width * 0.12, height * 0.78, 72, 22, 0x000000, 0.22).setDepth(5);
              runner = scene.add.container(width * 0.12, height * 0.74);
              const cape = scene.add.rectangle(0, 8, 58, 68, 0x354a67, 1).setStrokeStyle(4, 0x2d1d13, 1);
              const head = scene.add.rectangle(0, -40, 42, 42, 0xfaedcd, 1).setStrokeStyle(4, 0x2d1d13, 1);
              const visor = scene.add.rectangle(0, -44, 34, 8, 0x2d1d13, 1);
              const body = scene.add.rectangle(0, 10, 52, 50, 0x5d7c6f, 1).setStrokeStyle(4, 0x2d1d13, 1);
              const armL = scene.add.rectangle(-34, 16, 14, 36, 0x5d7c6f, 1).setAngle(8);
              const armR = scene.add.rectangle(34, 16, 14, 36, 0x5d7c6f, 1).setAngle(-8);
              const legL = scene.add.rectangle(-12, 62, 14, 40, 0x3f342b, 1);
              const legR = scene.add.rectangle(12, 62, 14, 40, 0x3f342b, 1);
              const eyeL = scene.add.rectangle(-8, -42, 4, 4, 0x2d1d13, 1);
              const eyeR = scene.add.rectangle(8, -42, 4, 4, 0x2d1d13, 1);
              runner.add([armL, armR, body, head, legL, legR, eyeL, eyeR]);
              runner.addAt(cape, 0);
              runner.add(visor);
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
                  target.face.setStrokeStyle(6, 0xd9a057, 1);
                  target.roof.fillAlpha = 0.4;
                  target.titleNode.setScale(1.06);
                  target.icon.setScale(1.12);
                  const targetX = target.door.x;
                  const targetY = target.door.y + 52;
                  runner.scaleX = target.x < runner.x ? -1 : 1;
                  if (immediate) {
                    runner.setPosition(targetX, targetY + idleOffset);
                    runnerShadow.setPosition(targetX, targetY + 52);
                    speechBubble.setPosition(targetX + 94, targetY - 36);
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
                      speechBubble.setPosition(runner.x + 94, runner.y - 36);
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
                    speechBubble.setPosition(base.x + 94, base.y - 36);
                  }
                },
                showSpeech(text, tone) {
                  if (!sceneRef || !speechBubble || !speechText || !runner) return;
                  speechText.setText(summarize(text));
                  const color = tone === "human" ? 0xd97a4a : tone === "tool" ? 0xc5a04f : 0x6d7fa4;
                  speechBg.setStrokeStyle(4, color, 1);
                  speechBubble.setPosition(runner.x + 94, runner.y - 36);
                  sceneRef.tweens.killTweensOf(speechBubble);
                  speechBubble.setAlpha(0);
                  speechBubble.y += 8;
                  sceneRef.tweens.add({
                    targets: speechBubble,
                    alpha: 1,
                    y: runner.y - 36,
                    duration: 220,
                    ease: "Quad.easeOut",
                  });
                },
                setHud(hud) {
                  if (!hudRoute || !hudTitle || !hudBody) return;
                  hudRoute.setText(hud.route);
                  hudTitle.setText(hud.title);
                  hudBody.setText(summarize(hud.text.length > 260 ? hud.text.slice(0, 257) + "..." : hud.text));
                  hudBeatItems.forEach((item, index) => {
                    const beat = hud.recent[index];
                    if (!beat) {
                      item.card.setAlpha(0.2);
                      item.label.setText("");
                      item.body.setText("");
                      return;
                    }
                    const isActive = hud.activeIndex === beats.indexOf(beat);
                    item.card.setAlpha(1);
                    item.card.setFillStyle(isActive ? 0x4a3119 : 0x291d14, 0.98);
                    item.card.setStrokeStyle(3, isActive ? 0xe6b85c : 0x6e4f2c, 1);
                    item.label.setText(beat.label);
                    item.body.setText(summarize(beat.text));
                  });
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
          phaserApi?.setHud({
            title: beats[activeIndex].label,
            text: beats[activeIndex].text,
            route: routeLine(beats[activeIndex], roomForBeat(beats[activeIndex])),
            recent: beats.slice(Math.max(0, activeIndex - 3), activeIndex + 1),
            activeIndex,
          });
          phaserApi?.showSpeech(beats[activeIndex].text, toneForBeat(beats[activeIndex]));
        }
      });

      createPhaserStage();
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
