import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const supportedAgents = ["codex", "cursor", "qoder", "qodercli"];

const agentRoots = {
  codex: path.join(os.homedir(), ".codex", "sessions"),
  qoder: path.join(os.homedir(), ".qoder", "projects"),
  qodercli: path.join(os.homedir(), ".qoder", "projects"),
  cursor: path.join(os.homedir(), ".cursor", "projects"),
};

function toCursorProjectKey(cwd) {
  return path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-");
}

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

async function readSessionCwd(filePath, agent) {
  const items = await readJsonl(filePath);
  if (agent === "codex") {
    return items.find((item) => item.type === "session_meta")?.payload?.cwd ?? null;
  }
  if (agent === "qoder" || agent === "qodercli") {
    return items.find((item) => item.cwd)?.cwd ?? null;
  }
  return null;
}

function cleanText(text) {
  return text
    .replace(/^<user_query>\s*/u, "")
    .replace(/\s*<\/user_query>$/u, "")
    .trim();
}

function joinBlocks(blocks = []) {
  return blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseCodex(items, sessionPath, agent) {
  const meta = items.find((item) => item.type === "session_meta")?.payload ?? {};
  const messages = items
    .map((item) => {
      if (item.type === "event_msg" && item.payload?.type === "agent_message") {
        return null;
      }

      if (item.type !== "response_item" || item.payload?.type !== "message") {
        return null;
      }

      const text = joinBlocks(item.payload.content);
      if (!text) {
        return null;
      }

      return {
        role: item.payload.role ?? "unknown",
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: meta.id ?? path.basename(sessionPath, ".jsonl"),
    cwd: meta.cwd ?? "unknown",
    messages,
  };
}

function parseQoder(items, sessionPath, agent) {
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
    sessionId: first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd: first.cwd ?? "unknown",
    messages,
  };
}

function parseCursor(items, sessionPath, agent) {
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
    messages,
  };
}

const parsers = {
  codex: parseCodex,
  qoder: parseQoder,
  qodercli: parseQoder,
  cursor: parseCursor,
};

function normalizeAgent(agent) {
  if (!agent) {
    return null;
  }
  return agent.toLowerCase();
}

export function detectAgent(sessionPath) {
  const value = sessionPath.toLowerCase();
  if (value.includes("/.codex/")) {
    return "codex";
  }
  if (value.includes("/.qoder/bin/qodercli/")) {
    return "qodercli";
  }
  if (value.includes("/.qoder/")) {
    return "qoder";
  }
  if (value.includes("/.cursor/") || value.includes("/agent-transcripts/")) {
    return "cursor";
  }
  return null;
}

export async function findLatestSession(rootDir = agentRoots.codex, options = {}) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const sortedFiles = files.sort();
  const cwd = options.cwd ?? null;
  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(sortedFiles[0]);

  if (!cwd || !agent) {
    return sortedFiles.at(-1);
  }

  if (agent === "cursor") {
    const projectKey = toCursorProjectKey(cwd);
    const matches = sortedFiles.filter((filePath) => filePath.includes(`${path.sep}${projectKey}${path.sep}`));
    return matches.sort().at(-1) ?? sortedFiles.at(-1);
  }

  const matches = [];
  for (const filePath of sortedFiles) {
    const sessionCwd = await readSessionCwd(filePath, agent);
    if (sessionCwd && path.resolve(sessionCwd) === path.resolve(cwd)) {
      matches.push(filePath);
    }
  }

  return matches.at(-1) ?? sortedFiles.at(-1);
}

export async function parseSession({ sessionPath, agent }) {
  const resolvedAgent = normalizeAgent(agent) ?? detectAgent(sessionPath);
  if (!resolvedAgent || !parsers[resolvedAgent]) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }

  const items = await readJsonl(sessionPath);
  return parsers[resolvedAgent](items, sessionPath, resolvedAgent);
}

export async function renderHandoff({ sessionPath, agent, target = "cursor" }) {
  const session = await parseSession({ sessionPath, agent });
  const transcript = session.messages.map((message) => `[${message.role}] ${message.text}`).join("\n\n");

  return [
    "# Agent Session Handoff",
    "",
    "Paste the useful parts of this context into the target agent and continue from there.",
    "",
    `Source Agent: ${agent ?? session.agent}`,
    `Target Agent: ${target}`,
    `Session ID: ${session.sessionId}`,
    `Source File: ${sessionPath}`,
    `Working Directory: ${session.cwd}`,
    "",
    "## Transcript",
    "",
    transcript,
    "",
  ].join("\n");
}

export function getDefaultRoot(agent = "codex") {
  const resolvedAgent = normalizeAgent(agent);
  if (!resolvedAgent || !agentRoots[resolvedAgent]) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }
  return agentRoots[resolvedAgent];
}
