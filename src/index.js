import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return entry.name.endsWith(".jsonl") ? [fullPath] : [];
    }),
  );

  return files.flat();
}

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function pullMessageText(item) {
  if (item.type === "event_msg" && item.payload?.type === "agent_message") {
    return null;
  }

  if (item.type !== "response_item" || item.payload?.type !== "message") {
    return null;
  }

  const blocks = item.payload.content ?? [];
  const text = blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    return null;
  }

  return {
    role: item.payload.role ?? "unknown",
    text,
  };
}

export async function findLatestSession(rootDir = path.join(os.homedir(), ".codex", "sessions")) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  return files.sort().at(-1);
}

export async function renderCursorPrompt(sessionPath) {
  const items = await readJsonl(sessionPath);
  const meta = items.find((item) => item.type === "session_meta")?.payload ?? {};
  const messages = items.map(pullMessageText).filter(Boolean);

  const transcript = messages
    .map((message) => `[${message.role}] ${message.text}`)
    .join("\n\n");

  return [
    "# Codex Session Handoff",
    "",
    "Paste the useful parts of this context into Cursor and continue from there.",
    "",
    `Session ID: ${meta.id ?? "unknown"}`,
    `Source File: ${sessionPath}`,
    `Working Directory: ${meta.cwd ?? "unknown"}`,
    "",
    "## Transcript",
    "",
    transcript,
    "",
  ].join("\n");
}
