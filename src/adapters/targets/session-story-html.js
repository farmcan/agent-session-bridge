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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${payload.title} · Session Story</title>
  <style>
    :root {
      --bg: #f3efe2;
      --panel: rgba(255, 251, 241, 0.9);
      --ink: #211f19;
      --muted: #6d665c;
      --line: #2d2a24;
      --accent-human: #dd7a4b;
      --accent-agent: #5d7c6f;
      --accent-tool: #c0a03d;
      --accent-think: #7f8bb7;
      --accent-commentary: #9a6a87;
      --shadow: 6px 6px 0 rgba(33, 31, 25, 0.18);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background:
      linear-gradient(180deg, #efe6cc 0%, #e4dcc3 100%);
      color: var(--ink);
      font-family: "Courier New", "SFMono-Regular", Consolas, monospace; }
    body { padding: 24px; }
    .shell { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
    .header, .panel {
      background: var(--panel);
      border: 3px solid var(--line);
      box-shadow: var(--shadow);
    }
    .header {
      padding: 16px 18px;
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .title { font-size: 20px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .meta { color: var(--muted); font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap; }
    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 1.45fr) minmax(280px, 0.95fr);
      gap: 18px;
    }
    .stage-panel { padding: 12px; position: relative; overflow: hidden; }
    #stage {
      position: relative;
      width: 100%;
      height: 540px;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 12%, rgba(255,255,255,0.5), transparent 24%),
        linear-gradient(180deg, #efe5b6 0%, #dfd4aa 54%, #b9a06c 54%, #b9a06c 100%);
      image-rendering: pixelated;
      border: 3px solid var(--line);
    }
    .stage-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(45,42,36,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(45,42,36,0.08) 1px, transparent 1px);
      background-size: 24px 24px;
      opacity: 0.45;
    }
    .legend {
      position: absolute;
      left: 24px;
      top: 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      pointer-events: none;
      z-index: 4;
    }
    .chip {
      padding: 6px 10px;
      border: 2px solid var(--line);
      background: rgba(255,255,255,0.72);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .accent-human { color: var(--accent-human); }
    .accent-agent { color: var(--accent-agent); }
    .accent-tool { color: var(--accent-tool); }
    .accent-think { color: var(--accent-think); }
    .accent-commentary { color: var(--accent-commentary); }
    .station {
      position: absolute;
      bottom: 82px;
      width: 180px;
      height: 148px;
      border: 3px solid var(--line);
      background: rgba(255, 250, 236, 0.84);
      box-shadow: var(--shadow);
      padding: 12px;
      z-index: 1;
    }
    .station-human { left: 24px; }
    .station-llm { left: calc(50% - 90px); }
    .station-tool { right: 24px; }
    .station-label {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .station-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .station-copy {
      font-size: 12px;
      line-height: 1.45;
    }
    .station-core {
      position: absolute;
      left: 50%;
      top: 64px;
      width: 52px;
      height: 52px;
      transform: translateX(-50%);
      border: 3px solid var(--line);
      background: #fff9e9;
    }
    .station-human .station-core::before,
    .station-human .station-core::after,
    .station-llm .station-core::before,
    .station-llm .station-core::after,
    .station-tool .station-core::before,
    .station-tool .station-core::after {
      content: "";
      position: absolute;
      background: var(--line);
    }
    .station-human .station-core::before { inset: 8px 18px 8px 18px; }
    .station-human .station-core::after { inset: 18px 8px 18px 8px; }
    .station-llm .station-core::before { inset: 8px; border: 3px solid var(--line); background: transparent; }
    .station-llm .station-core::after { inset: 18px; background: var(--accent-think); }
    .station-tool .station-core::before { left: 8px; top: 20px; width: 36px; height: 8px; }
    .station-tool .station-core::after { left: 22px; top: 8px; width: 8px; height: 36px; }
    .runner-layer {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 54px;
      height: 180px;
      z-index: 3;
    }
    .runner {
      position: absolute;
      left: 80px;
      bottom: 18px;
      width: 76px;
      height: 120px;
      transform-origin: 50% 100%;
      filter: drop-shadow(4px 6px 0 rgba(33,31,25,0.18));
    }
    .runner-shadow {
      position: absolute;
      left: 16px;
      bottom: 0;
      width: 44px;
      height: 10px;
      background: rgba(33,31,25,0.18);
      border-radius: 999px;
    }
    .runner-body {
      position: absolute;
      left: 20px;
      bottom: 18px;
      width: 36px;
      height: 60px;
      background: var(--accent-agent);
      box-shadow:
        0 -18px 0 0 #f8eed1,
        0 -38px 0 0 var(--accent-agent),
        -12px 8px 0 0 var(--accent-agent),
        12px 8px 0 0 var(--accent-agent);
    }
    .runner-eye {
      position: absolute;
      top: 28px;
      width: 4px;
      height: 4px;
      background: var(--line);
    }
    .runner-eye.left { left: 30px; }
    .runner-eye.right { left: 42px; }
    .runner-leg {
      position: absolute;
      bottom: 4px;
      width: 10px;
      height: 24px;
      background: #3f342b;
      transform-origin: 50% 0%;
    }
    .runner-leg.left { left: 24px; }
    .runner-leg.right { left: 42px; }
    .runner.walking .runner-leg.left { animation: leg-left 0.22s linear infinite; }
    .runner.walking .runner-leg.right { animation: leg-right 0.22s linear infinite; }
    .runner.talking .runner-body { box-shadow:
      0 -18px 0 0 #f8eed1,
      0 -38px 0 0 var(--accent-agent),
      -12px 6px 0 0 var(--accent-agent),
      12px 10px 0 0 var(--accent-agent);
    }
    .bubble {
      position: absolute;
      min-width: 220px;
      max-width: 300px;
      padding: 10px 12px;
      border: 3px solid var(--line);
      background: rgba(255, 251, 241, 0.94);
      box-shadow: var(--shadow);
      font-size: 13px;
      line-height: 1.45;
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
    }
    .bubble::after {
      content: "";
      position: absolute;
      left: 18px;
      bottom: -11px;
      width: 18px;
      height: 18px;
      background: rgba(255, 251, 241, 0.94);
      border-right: 3px solid var(--line);
      border-bottom: 3px solid var(--line);
      transform: rotate(45deg);
    }
    .floor-label {
      position: absolute;
      bottom: 18px;
      font-size: 11px;
      text-transform: uppercase;
      color: rgba(33,31,25,0.58);
      letter-spacing: 0.08em;
      z-index: 1;
    }
    .floor-human { left: 54px; }
    .floor-llm { left: calc(50% - 44px); }
    .floor-tool { right: 58px; }
    @keyframes leg-left {
      0% { transform: rotate(18deg); }
      50% { transform: rotate(-18deg); }
      100% { transform: rotate(18deg); }
    }
    @keyframes leg-right {
      0% { transform: rotate(-18deg); }
      50% { transform: rotate(18deg); }
      100% { transform: rotate(-18deg); }
    }
    .sidebar { display: grid; gap: 18px; align-content: start; }
    .panel { padding: 14px; }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    button, select {
      border: 2px solid var(--line);
      background: #fff9e9;
      color: var(--ink);
      padding: 8px 10px;
      font: inherit;
      cursor: pointer;
      box-shadow: 3px 3px 0 rgba(33, 31, 25, 0.14);
    }
    button:active { transform: translate(1px, 1px); box-shadow: 2px 2px 0 rgba(33, 31, 25, 0.14); }
    .event-card { min-height: 172px; }
    .eyebrow { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .event-label { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
    .event-text { line-height: 1.6; white-space: pre-wrap; }
    .timeline { max-height: 480px; overflow: auto; display: grid; gap: 10px; padding-right: 4px; }
    .timeline-item {
      padding: 10px 12px;
      border: 2px solid var(--line);
      background: rgba(255, 255, 255, 0.65);
      cursor: pointer;
    }
    .timeline-item.active { background: #fff4cb; transform: translateX(3px); }
    .timeline-item[hidden] { display: none; }
    .timeline-type { font-size: 12px; text-transform: uppercase; color: var(--muted); }
    .timeline-text { margin-top: 6px; line-height: 1.45; }
    @media (max-width: 980px) {
      body { padding: 16px; }
      .layout { grid-template-columns: 1fr; }
      #stage { height: 420px; }
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
        <span>pixel stage: PixiJS</span>
        <span>timeline: Anime.js</span>
      </div>
    </section>
    <section class="layout">
      <div class="panel stage-panel">
        <div id="stage">
          <div class="stage-grid"></div>
          <div id="station-human" class="station station-human">
            <div class="station-label">Human Zone</div>
            <div class="station-title">User Dock</div>
            <div class="station-copy">用户提需求、打断、确认方向。</div>
            <div class="station-core"></div>
          </div>
          <div id="station-llm" class="station station-llm">
            <div class="station-label">Core Loop</div>
            <div class="station-title">LLM Console</div>
            <div class="station-copy">思考、组织回复、决定下一步动作。</div>
            <div class="station-core"></div>
          </div>
          <div id="station-tool" class="station station-tool">
            <div class="station-label">Execution</div>
            <div class="station-title">Tool Workshop</div>
            <div class="station-copy">跑命令、读文件、调用工具、拿结果。</div>
            <div class="station-core"></div>
          </div>
          <div class="floor-label floor-human">Human</div>
          <div class="floor-label floor-llm">LLM</div>
          <div class="floor-label floor-tool">Tools</div>
          <div class="runner-layer">
            <div id="runner" class="runner">
              <div class="runner-shadow"></div>
              <div class="runner-body"></div>
              <div class="runner-eye left"></div>
              <div class="runner-eye right"></div>
              <div class="runner-leg left"></div>
              <div class="runner-leg right"></div>
            </div>
            <div id="bubble" class="bubble"></div>
          </div>
        </div>
        <div class="legend">
          <div class="chip accent-human">Human</div>
          <div class="chip accent-agent">Agent</div>
          <div class="chip accent-tool">Tool</div>
          <div class="chip accent-think">Thinking</div>
        </div>
      </div>
      <div class="sidebar">
        <section class="panel">
          <div class="eyebrow">Playback</div>
          <div class="controls">
            <button id="play-button" type="button">Play</button>
            <button id="pause-button" type="button">Pause</button>
            <button id="prev-button" type="button">Prev</button>
            <button id="next-button" type="button">Next</button>
            <select id="speed-select" aria-label="Playback speed">
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            <select id="filter-select" aria-label="Filter events">
              <option value="all">All Events</option>
              <option value="user">Human</option>
              <option value="reasoning">Thinking</option>
              <option value="commentary">Commentary</option>
              <option value="tool_call">Tool Calls</option>
              <option value="tool_result">Tool Results</option>
              <option value="assistant">Replies</option>
            </select>
          </div>
        </section>
        <section class="panel event-card">
          <div class="eyebrow">Current Beat</div>
          <div id="event-label" class="event-label">Ready</div>
          <div id="event-text" class="event-text">Press play to replay this session as a pixel story.</div>
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
    (async function () {
      const story = JSON.parse(document.getElementById("story-data").textContent);
      const stageElement = document.getElementById("stage");
      const runnerElement = document.getElementById("runner");
      const bubbleElement = document.getElementById("bubble");
      const timelineElement = document.getElementById("timeline");
      const eventLabel = document.getElementById("event-label");
      const eventText = document.getElementById("event-text");
      const playButton = document.getElementById("play-button");
      const pauseButton = document.getElementById("pause-button");
      const prevButton = document.getElementById("prev-button");
      const nextButton = document.getElementById("next-button");
      const speedSelect = document.getElementById("speed-select");
      const filterSelect = document.getElementById("filter-select");
      const events = Array.isArray(story.events) ? story.events : [];
      let activeIndex = -1;
      let playbackTimer = null;
      let playbackRate = 1;
      let runnerX = 80;
      let idlePhase = 0;

      const stationElements = {
        human: document.getElementById("station-human"),
        llm: document.getElementById("station-llm"),
        tool: document.getElementById("station-tool"),
      };

      function eventActor(event) {
        if (event.type === "user") return "human";
        if (event.type === "tool_call" || event.type === "tool_result") return "tool";
        return "llm";
      }

      function summarize(text) {
        if (!text) return "";
        return text.length > 92 ? text.slice(0, 89) + "..." : text;
      }

      function stationX(kind) {
        const station = stationElements[kind];
        const stageRect = stageElement.getBoundingClientRect();
        const stationRect = station.getBoundingClientRect();
        return stationRect.left - stageRect.left + stationRect.width / 2 - runnerElement.offsetWidth / 2;
      }

      function stageColor(kind) {
        if (kind === "human") return "var(--accent-human)";
        if (kind === "tool") return "var(--accent-tool)";
        if (kind === "llm") return "var(--accent-think)";
        return "var(--accent-agent)";
      }

      function setRunnerColor(kind) {
        runnerElement.style.setProperty("--runner-color", stageColor(kind));
        runnerElement.querySelector(".runner-body").style.background = stageColor(kind);
      }

      function moveRunnerTo(kind, immediate) {
        const targetX = stationX(kind);
        const distance = Math.abs(targetX - runnerX);
        runnerElement.classList.add("walking");
        runnerElement.style.transform = targetX < runnerX ? "scaleX(-1)" : "scaleX(1)";

        if (typeof anime === "function" && !immediate) {
          anime({
            targets: { value: runnerX },
            value: targetX,
            duration: Math.max(380, Math.min(980, distance * 1.6)),
            easing: "easeInOutQuad",
            update(anim) {
              runnerX = anim.animations[0].currentValue;
              runnerElement.style.left = runnerX + "px";
            },
            complete() {
              runnerX = targetX;
              runnerElement.style.left = runnerX + "px";
              runnerElement.classList.remove("walking");
            },
          });
        } else {
          runnerX = targetX;
          runnerElement.style.left = runnerX + "px";
          setTimeout(() => runnerElement.classList.remove("walking"), immediate ? 0 : 320);
        }
      }

      function showBubble(text, kind) {
        bubbleElement.textContent = summarize(text);
        bubbleElement.style.left = Math.max(18, Math.min(stageElement.clientWidth - 324, runnerX - 80)) + "px";
        bubbleElement.style.bottom = kind === "tool" ? "146px" : "154px";
        bubbleElement.style.borderColor = "var(--line)";
        bubbleElement.style.background = kind === "human"
          ? "rgba(255, 238, 226, 0.96)"
          : kind === "tool"
            ? "rgba(255, 248, 214, 0.96)"
            : "rgba(239, 244, 255, 0.96)";
        if (typeof anime === "function") {
          anime.remove(bubbleElement);
          anime({
            targets: bubbleElement,
            opacity: [0, 1],
            translateY: [10, 0],
            duration: 220,
            easing: "easeOutQuad",
          });
        } else {
          bubbleElement.style.opacity = "1";
          bubbleElement.style.transform = "translateY(0)";
        }
      }

      function pulseStation(kind) {
        const station = stationElements[kind];
        if (typeof anime === "function") {
          anime.remove(station);
          anime({
            targets: station,
            scale: [1, 1.04, 1],
            duration: 420,
            easing: "easeOutQuad",
          });
        } else {
          station.style.transform = "scale(1.03)";
          setTimeout(() => { station.style.transform = "scale(1)"; }, 260);
        }
      }

      function startIdleLoop() {
        function tick() {
          idlePhase += 0.08;
          if (!runnerElement.classList.contains("walking")) {
            const bob = Math.sin(idlePhase) * 3.2;
            const scaleX = runnerElement.style.transform.includes("-1") ? -1 : 1;
            runnerElement.style.translate = "0 " + bob + "px";
            runnerElement.style.transform = "scaleX(" + scaleX + ")";
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }

      function renderTimeline() {
      timelineElement.replaceChildren();
      events.forEach((event, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "timeline-item";
        item.dataset.index = String(index);
        item.dataset.type = event.type;
        item.innerHTML = '<div class="timeline-type">' + event.label + '</div><div class="timeline-text">' + summarize(event.text) + '</div>';
        item.addEventListener("click", () => showEvent(index, { animate: true }));
        timelineElement.appendChild(item);
      });
      }

      function bounceActor(actor, options = {}) {
        anime({
          targets: actor.container,
          keyframes: [
            { y: actor.container.y - (options.jump || 22), duration: 180 },
            { y: actor.container.y, duration: 220 },
          ],
          easing: "easeOutQuad",
        });
        anime({
          targets: actor.container.scale,
          keyframes: [
            { x: 3.15, y: 2.82, duration: 120 },
            { x: 3, y: 3, duration: 220 },
          ],
          easing: "easeOutQuad",
        });
      }

      function showReasoningPulse() {
        pulse.alpha = 0.95;
        pulse.scale.set(0.5);
        anime({ targets: pulse, alpha: [0.95, 0], duration: 520, easing: "easeOutQuad" });
        anime({ targets: pulse.scale, x: [0.5, 1.8], y: [0.5, 1.8], duration: 520, easing: "easeOutQuad" });
      }

      function showToolOrb(color) {
        orb.alpha = 1;
        orb.tint = color;
        orb.scale.set(2.2);
        orb.x = actorPositions.agent;
        orb.y = app.screen.height - 235;
        anime({ targets: orb, x: actorPositions.tool, y: app.screen.height - 235, duration: 360, easing: "easeInOutQuad" });
        anime({ targets: orb.scale, x: [2.2, 3], y: [2.2, 3], duration: 360, easing: "easeOutQuad" });
        anime({ targets: orb, alpha: [1, 0], duration: 500, delay: 180, easing: "easeOutQuad" });
      }

      function highlightTimeline(index) {
        timelineElement.querySelectorAll(".timeline-item").forEach((node) => {
          node.classList.toggle("active", Number(node.dataset.index) === index);
        });
      }

      function showEvent(index, options = {}) {
        if (index < 0 || index >= events.length) return;
        activeIndex = index;
        const event = events[index];
        const actor = eventActor(event);
        eventLabel.textContent = event.label;
        eventText.textContent = event.text;
        highlightTimeline(index);
        setRunnerColor(actor);
        moveRunnerTo(actor, options.immediate === true);
        pulseStation(actor);
        runnerElement.classList.add("talking");
        setTimeout(() => runnerElement.classList.remove("talking"), 420);
        showBubble(event.text, actor);

        if (options.scroll !== false) {
          timelineElement.querySelector('.timeline-item[data-index="' + index + '"]')?.scrollIntoView({ block: "nearest" });
        }
      }

      function visibleIndexes() {
      return events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => filterSelect.value === "all" || event.type === filterSelect.value)
        .map(({ index }) => index);
      }

      function move(step) {
      const visible = visibleIndexes();
      if (visible.length === 0) return;
      const current = visible.indexOf(activeIndex);
      const nextOffset = current === -1 ? 0 : Math.min(Math.max(current + step, 0), visible.length - 1);
      showEvent(visible[nextOffset], { animate: true });
      }

      function schedulePlayback() {
      clearTimeout(playbackTimer);
      const visible = visibleIndexes();
      if (visible.length === 0) return;
      const current = visible.indexOf(activeIndex);
      const nextIndex = current === -1 ? visible[0] : visible[current + 1];
      if (nextIndex == null) return;
      playbackTimer = setTimeout(() => {
        showEvent(nextIndex, { animate: true });
        schedulePlayback();
      }, 1200 / playbackRate);
      }

      function applyFilter() {
      timelineElement.querySelectorAll(".timeline-item").forEach((node) => {
        const hidden = filterSelect.value !== "all" && node.dataset.type !== filterSelect.value;
        node.hidden = hidden;
      });
      const visible = visibleIndexes();
      if (!visible.includes(activeIndex) && visible.length > 0) {
        showEvent(visible[0], { animate: false });
      }
      }

      playButton.addEventListener("click", () => {
        if (activeIndex === -1) {
          const visible = visibleIndexes();
          if (visible[0] != null) showEvent(visible[0], { animate: true });
        }
        schedulePlayback();
      });
      pauseButton.addEventListener("click", () => clearTimeout(playbackTimer));
      prevButton.addEventListener("click", () => move(-1));
      nextButton.addEventListener("click", () => move(1));
      speedSelect.addEventListener("change", () => {
        playbackRate = Number(speedSelect.value) || 1;
        if (playbackTimer) schedulePlayback();
      });
      filterSelect.addEventListener("change", applyFilter);
      window.addEventListener("resize", () => {
        const currentEvent = events[activeIndex];
        if (currentEvent) {
          moveRunnerTo(eventActor(currentEvent), true);
          showBubble(currentEvent.text, eventActor(currentEvent));
        }
      });

      renderTimeline();
      runnerElement.style.left = runnerX + "px";
      applyFilter();
      if (events[0]) showEvent(0, { immediate: true });
      startIdleLoop();
      if (events.length > 1) {
        setTimeout(() => schedulePlayback(), 360);
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
