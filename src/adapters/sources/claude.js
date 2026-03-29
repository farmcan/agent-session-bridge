import path from "node:path";

import { extractClaudeText } from "./shared.js";

export function readSessionCwd(items) {
  return items.find((item) => item.cwd)?.cwd ?? null;
}

export function parse(items, sessionPath, agent) {
  const first = items.find((item) => item.sessionId) ?? {};
  const messages = items
    .map((item) => {
      if (item.type !== "user" && item.type !== "assistant") {
        return null;
      }

      const role = item.message?.role ?? item.type;
      const text = extractClaudeText(item.message?.content);
      if (!text) {
        return null;
      }

      return { role, text };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd: first.cwd ?? "unknown",
    title: null,
    updatedAt: first.timestamp ?? null,
    rawItems: items,
    messages,
  };
}
