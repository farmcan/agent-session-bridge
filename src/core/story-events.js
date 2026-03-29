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
  return {
    sessionId: session.sessionId,
    sourceAgent: context.sourceAgent ?? session.agent,
    targetAgent: context.targetAgent ?? null,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
    title,
    events: buildStoryEvents(session),
  };
}
