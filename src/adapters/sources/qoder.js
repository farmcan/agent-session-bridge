import path from "node:path";

import { joinBlocks, readQoderSidecar } from "./shared.js";

export function readSessionCwd(items) {
  return items.find((item) => item.cwd)?.cwd ?? null;
}

export async function parse(items, sessionPath, agent) {
  const sidecar = await readQoderSidecar(sessionPath);
  const first = items.find((item) => !item.isMeta) ?? items[0] ?? {};
  const messages = items
    .filter((item) => !item.isMeta)
    .map((item) => {
      const text = joinBlocks(item.message?.content);
      if (!text) {
        return null;
      }

      return {
        role: item.message?.role ?? item.type ?? "unknown",
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: sidecar?.id ?? first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd: sidecar?.working_dir ?? first.cwd ?? "unknown",
    title: sidecar?.title ?? null,
    updatedAt: sidecar?.updated_at ? new Date(sidecar.updated_at).toISOString() : null,
    messages,
  };
}
