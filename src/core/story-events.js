import { joinBlocks } from "../adapters/sources/shared.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function pushEvent(events, event) {
  const text = trimText(event.text);
  if (!text) {
    return;
  }

  events.push({
    id: `${event.type}-${events.length + 1}`,
    timestamp: event.timestamp ?? null,
    role: event.role ?? null,
    label: event.label ?? event.type,
    ...event,
    text,
  });
}

function extractToolText(value) {
  if (typeof value === "string") {
    return trimText(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        return entry?.text ?? entry?.content ?? "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    return trimText(value.text ?? value.content ?? value.output ?? "");
  }
  return "";
}

function normalizeToolName(name) {
  const normalized = trimText(name);
  return normalized || "tool";
}

function titleizeToolName(toolName) {
  return toolName
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roomIdForEvent(event, toolRooms) {
  if (event.type === "user" || event.type === "assistant") {
    return "human-hall";
  }
  if (event.type === "reasoning" || event.type === "commentary") {
    return "llm-core";
  }
  if (event.type === "tool_call" || event.type === "tool_result") {
    const match = toolRooms.find((room) => room.toolName === event.toolName);
    return match?.id ?? "tool-workshop";
  }
  return "llm-core";
}

function summarizeBeatLabel(events, roomId, toolRooms) {
  const first = events[0];
  if (!first) {
    return "Beat";
  }

  if (roomId === "human-hall") {
    return first.type === "user" ? "Human Exchange" : "Agent Reply";
  }
  if (roomId === "llm-core") {
    return "Reasoning Beat";
  }
  const toolRoom = toolRooms.find((room) => room.id === roomId);
  return toolRoom ? `${toolRoom.title} Beat` : first.label;
}

function summarizeBeatText(events) {
  return events
    .map((event) => trimText(event.text))
    .filter(Boolean)
    .slice(0, 3)
    .join("\n\n");
}

function shouldMergeBeat(currentBeat, nextEvent, nextRoomId) {
  if (!currentBeat || currentBeat.roomId !== nextRoomId) {
    return false;
  }
  if (currentBeat.events.length >= 3) {
    return false;
  }

  const previous = currentBeat.events.at(-1);
  if (!previous) {
    return false;
  }

  if (previous.type === "tool_call" && nextEvent.type === "tool_result" && previous.toolName === nextEvent.toolName) {
    return true;
  }

  const roomIsHumanOrLlm = nextRoomId === "human-hall" || nextRoomId === "llm-core";
  if (roomIsHumanOrLlm && previous.role === nextEvent.role) {
    return true;
  }

  return roomIsHumanOrLlm && ["commentary", "assistant", "reasoning", "user"].includes(previous.type) && ["commentary", "assistant", "reasoning", "user"].includes(nextEvent.type);
}

function buildStoryBeats(events, toolRooms) {
  const beats = [];

  for (const event of events) {
    const roomId = roomIdForEvent(event, toolRooms);
    const currentBeat = beats.at(-1);

    if (shouldMergeBeat(currentBeat, event, roomId)) {
      currentBeat.events.push(event);
      currentBeat.text = summarizeBeatText(currentBeat.events);
      continue;
    }

    beats.push({
      id: `beat-${beats.length + 1}`,
      roomId,
      label: summarizeBeatLabel([event], roomId, toolRooms),
      text: summarizeBeatText([event]),
      type: event.type,
      events: [event],
      timestamp: event.timestamp ?? null,
    });
  }

  for (const beat of beats) {
    beat.label = summarizeBeatLabel(beat.events, beat.roomId, toolRooms);
    beat.text = summarizeBeatText(beat.events);
  }

  return beats;
}

function classifyToolName(toolName) {
  const normalized = normalizeToolName(toolName).toLowerCase();

  if (
    [
      "read_file",
      "write_file",
      "edit_file",
      "apply_patch",
      "glob",
      "ls",
      "rg",
      "grep",
      "find_files",
    ].includes(normalized)
  ) {
    return { key: "filesystem", title: "Filesystem Wing" };
  }

  if (
    [
      "exec_command",
      "bash",
      "shell",
      "terminal",
      "python",
      "run_command",
      "npm",
      "pnpm",
      "yarn",
    ].includes(normalized)
  ) {
    return { key: "terminal", title: "Terminal Wing" };
  }

  if (
    [
      "search_query",
      "open",
      "click",
      "find",
      "image_query",
      "web_search",
      "browser",
      "fetch_url",
    ].includes(normalized)
  ) {
    return { key: "search", title: "Search Wing" };
  }

  if (
    normalized.startsWith("git") ||
    normalized.startsWith("gh") ||
    normalized.includes("github") ||
    normalized.includes("pull_request")
  ) {
    return { key: "git", title: "Git / GitHub Wing" };
  }

  return { key: "tools", title: "General Tools Wing" };
}

function isCodexBootstrapMessage(role, text) {
  return role === "user" && trimText(text).startsWith("# AGENTS.md instructions for ");
}

function extractCodexEvents(rawItems = [], session) {
  const events = [];

  for (const item of rawItems) {
    const timestamp = item.timestamp ?? null;

    if (item.type === "event_msg" && item.payload?.type === "agent_message") {
      pushEvent(events, {
        type: "commentary",
        role: "assistant",
        label: "Agent Commentary",
        text: item.payload.message,
        timestamp,
      });
      continue;
    }

    if (item.type !== "response_item") {
      continue;
    }

    const payloadType = item.payload?.type;

    if (payloadType === "message") {
      const role = item.payload?.role;
      if (role === "developer" || role === "system") {
        continue;
      }
      const text = joinBlocks(item.payload?.content);
      if (isCodexBootstrapMessage(role, text)) {
        continue;
      }

      pushEvent(events, {
        type: role === "user" ? "user" : "assistant",
        role,
        label: role === "user" ? "Human Input" : "Agent Reply",
        text,
        timestamp,
      });
      continue;
    }

    if (["function_call", "custom_tool_call", "tool_call"].includes(payloadType)) {
      const toolName = normalizeToolName(item.payload?.name ?? item.payload?.tool_name);
      pushEvent(events, {
        type: "tool_call",
        role: "assistant",
        label: `Tool Call: ${toolName}`,
        text: extractToolText(item.payload?.arguments ?? item.payload?.input) || `${toolName} invoked`,
        toolName,
        timestamp,
      });
      continue;
    }

    if (["function_call_output", "custom_tool_call_output", "tool_result"].includes(payloadType)) {
      pushEvent(events, {
        type: "tool_result",
        role: "tool",
        label: "Tool Result",
        text: extractToolText(item.payload?.output ?? item.payload?.content) || "Tool finished",
        toolName: normalizeToolName(item.payload?.name ?? item.payload?.tool_name),
        timestamp,
      });
    }
  }

  return events.length > 0 ? events : extractMessageFallback(session);
}

function extractClaudeEvents(rawItems = [], session) {
  const events = [];

  for (const item of rawItems) {
    const timestamp = item.timestamp ?? null;

    if (item.type === "user") {
      const content = item.message?.content;
      if (typeof content === "string") {
        pushEvent(events, {
          type: "user",
          role: "user",
          label: "Human Input",
          text: content,
          timestamp,
        });
        continue;
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_result") {
            pushEvent(events, {
              type: "tool_result",
              role: "tool",
              label: "Tool Result",
              text: extractToolText(block.content),
              toolName: normalizeToolName(block.name ?? block.tool_use_id),
              timestamp,
            });
          } else if (block?.type === "text") {
            pushEvent(events, {
              type: "user",
              role: "user",
              label: "Human Input",
              text: block.text,
              timestamp,
            });
          }
        }
      }

      continue;
    }

    if (item.type !== "assistant") {
      continue;
    }

    const content = Array.isArray(item.message?.content) ? item.message.content : [];
    for (const block of content) {
      if (block?.type === "thinking") {
        pushEvent(events, {
          type: "reasoning",
          role: "assistant",
          label: "LLM Thinking",
          text: block.thinking,
          timestamp,
        });
      } else if (block?.type === "tool_use") {
        const toolName = normalizeToolName(block.name);
        pushEvent(events, {
          type: "tool_call",
          role: "assistant",
          label: `Tool Call: ${toolName}`,
          text: extractToolText(block.input) || `${toolName} invoked`,
          toolName,
          timestamp,
        });
      } else if (block?.type === "text") {
        pushEvent(events, {
          type: "assistant",
          role: "assistant",
          label: "Agent Reply",
          text: block.text,
          timestamp,
        });
      }
    }
  }

  return events.length > 0 ? events : extractMessageFallback(session);
}

function extractQoderEvents(rawItems = [], session) {
  const events = [];

  for (const item of rawItems) {
    if (item.isMeta) {
      continue;
    }

    const timestamp = item.timestamp ?? null;
    const role = item.message?.role ?? item.type ?? "assistant";
    const text = joinBlocks(item.message?.content);
    if (!text) {
      continue;
    }

    pushEvent(events, {
      type: role === "user" ? "user" : "assistant",
      role,
      label: role === "user" ? "Human Input" : "Agent Reply",
      text,
      timestamp,
    });
  }

  return events.length > 0 ? events : extractMessageFallback(session);
}

function extractMessageFallback(session) {
  return (session.messages ?? []).map((message, index) => ({
    id: `${message.role}-${index + 1}`,
    type: message.role === "user" ? "user" : "assistant",
    role: message.role,
    label: message.role === "user" ? "Human Input" : "Agent Reply",
    text: trimText(message.text),
    timestamp: null,
  }));
}

export function buildStoryEvents(session) {
  if (session.agent === "codex") {
    return extractCodexEvents(session.rawItems, session);
  }
  if (session.agent === "claude") {
    return extractClaudeEvents(session.rawItems, session);
  }
  if (session.agent === "qoder" || session.agent === "qodercli") {
    return extractQoderEvents(session.rawItems, session);
  }
  return extractMessageFallback(session);
}

export function buildStoryPayload(session, context = {}) {
  const title = trimText(session.title) || trimText(session.messages?.find((message) => message.role === "user")?.text) || "Session Story";
  const events = buildStoryEvents(session);
  const seenRoomIds = new Set();
  const toolRooms = events
    .filter((event) => event.type === "tool_call" || event.type === "tool_result")
    .map((event) => trimText(event.toolName) || "tool")
    .filter(Boolean)
    .map((toolName) => ({
      id: `tool-${toolName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "tool"}`,
      toolName,
      title: titleizeToolName(toolName),
      category: classifyToolName(toolName),
    }))
    .filter((room) => {
      if (seenRoomIds.has(room.id)) {
        return false;
      }
      seenRoomIds.add(room.id);
      return true;
    });
  const normalizedToolRooms =
    toolRooms.length > 0
      ? toolRooms
      : [
          {
            id: "tool-workshop",
            toolName: "tool",
            title: "Tool Workshop",
            category: { key: "tools", title: "General Tools Wing" },
          },
        ];
  const beats = buildStoryBeats(events, normalizedToolRooms);

  return {
    sessionId: session.sessionId,
    sourceAgent: context.sourceAgent ?? session.agent,
    targetAgent: context.targetAgent ?? null,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
    title,
    events,
    beats,
    toolRooms: normalizedToolRooms,
  };
}
