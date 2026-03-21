import path from "node:path";

import { cleanText, joinBlocks } from "./shared.js";

export function readSessionCwd() {
  return null;
}

export function parse(items, sessionPath, agent) {
  const messages = items
    .map((item) => {
      const text = cleanText(joinBlocks(item.message?.content));
      if (!text) {
        return null;
      }

      return {
        role: item.role ?? "unknown",
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: path.basename(sessionPath, ".jsonl"),
    cwd: "unknown",
    title: null,
    updatedAt: null,
    messages,
  };
}
