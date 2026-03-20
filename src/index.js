import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const supportedAgents = ["claude", "codex", "cursor", "qoder", "qodercli"];

const agentRoots = {
  claude: path.join(os.homedir(), ".claude", "projects"),
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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readQoderSidecar(filePath) {
  const sidecarPath = filePath.replace(/\.jsonl$/u, "-session.json");
  try {
    return await readJson(sidecarPath);
  } catch {
    return null;
  }
}

async function readSessionCwd(filePath, agent) {
  const items = await readJsonl(filePath);
  if (agent === "claude") {
    return items.find((item) => item.cwd)?.cwd ?? null;
  }
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

function isCodexBootstrapMessage(role, text) {
  return role === "user" && text.trimStart().startsWith("# AGENTS.md instructions for ");
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

      if (item.payload.role === "developer" || item.payload.role === "system") {
        return null;
      }

      const text = joinBlocks(item.payload.content);
      if (!text) {
        return null;
      }

      if (isCodexBootstrapMessage(item.payload.role, text)) {
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
    title: null,
    updatedAt: meta.timestamp ?? null,
    messages,
  };
}

async function parseQoder(items, sessionPath, agent) {
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
    updatedAt: sidecar?.updated_at ?? null,
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
    title: null,
    updatedAt: null,
    messages,
  };
}

function extractClaudeText(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseClaude(items, sessionPath, agent) {
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

      return {
        role,
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd: first.cwd ?? "unknown",
    title: null,
    updatedAt: first.timestamp ?? null,
    messages,
  };
}

const parsers = {
  claude: parseClaude,
  codex: parseCodex,
  qoder: parseQoder,
  qodercli: parseQoder,
  cursor: parseCursor,
};

const agentAliases = {
  c: "claude",
  x: "codex",
  q: "qoder",
  r: "cursor",
};

function normalizeAgent(agent) {
  if (!agent) {
    return null;
  }
  const normalized = agent.toLowerCase();
  return agentAliases[normalized] ?? normalized;
}

export function detectAgent(sessionPath) {
  const value = sessionPath.toLowerCase();
  if (value.includes("/.claude/")) {
    return "claude";
  }
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

function fileLooksLikeSessionId(filePath, sessionId) {
  const baseName = path.basename(filePath, ".jsonl");
  if (baseName === sessionId) {
    return true;
  }
  return baseName.endsWith(`-${sessionId}`);
}

export async function findSessionById(rootDir = agentRoots.codex, options = {}) {
  const { sessionId } = options;
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(files[0]);
  for (const filePath of files.sort()) {
    if (fileLooksLikeSessionId(filePath, sessionId)) {
      return filePath;
    }
  }

  for (const filePath of files.sort()) {
    const session = await parseSession({ sessionPath: filePath, agent });
    if (session.sessionId === sessionId) {
      return filePath;
    }
  }

  throw new Error(`Session not found: ${sessionId}`);
}

export async function parseSession({ sessionPath, agent }) {
  const resolvedAgent = normalizeAgent(agent) ?? detectAgent(sessionPath);
  if (!resolvedAgent || !parsers[resolvedAgent]) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }

  const items = await readJsonl(sessionPath);
  return parsers[resolvedAgent](items, sessionPath, resolvedAgent);
}

export function splitSession(session, { recentUserTurns = 1 } = {}) {
  const targetTurns = Number(recentUserTurns);
  if (!Number.isInteger(targetTurns) || targetTurns < 1) {
    throw new Error("split recent turns must be a positive integer");
  }

  let seenUserTurns = 0;
  let startIndex = session.messages.length;
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    if (isSkippableSplitUserMessage(session.messages[index])) {
      continue;
    }

    if (session.messages[index].role === "user") {
      seenUserTurns += 1;
      startIndex = index;
      if (seenUserTurns === targetTurns) {
        break;
      }
    }
  }

  return {
    ...session,
    messages: session.messages.slice(startIndex).filter((message) => !isSkippableSplitUserMessage(message)),
  };
}

export function forkSession(session, { prompt } = {}) {
  const forkPrompt = String(prompt ?? "").trim();
  if (!forkPrompt) {
    throw new Error("fork prompt must be a non-empty string");
  }

  return {
    ...session,
    messages: [
      ...session.messages,
      { role: "user", text: forkPrompt },
    ],
  };
}

function buildSuggestedNextStep(session) {
  const lastUserMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === "user" && !isSkippableSplitUserMessage(message));
  if (!lastUserMessage) {
    return "Read the transcript, inspect the current repository state, and continue from the most likely unfinished point.";
  }

  return `Start by checking the latest user request: "${lastUserMessage.text}". Verify it against the current repository, then continue from the most likely unfinished point.`;
}

function normalizeIsoForCodexFile(timestamp) {
  return timestamp.replace(/:/gu, "-").replace(/\./gu, "-");
}

function toCodexMessageContent(message) {
  if (message.role === "assistant") {
    return [{ type: "output_text", text: message.text }];
  }
  return [{ type: "input_text", text: message.text }];
}

function isSkippableSplitUserMessage(message) {
  if (message.role !== "user") {
    return false;
  }

  const normalized = message.text.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "[request interrupted by user]" ||
    normalized === "[interrupted by user]"
  );
}

export async function renderCodexResumeExport({
  sessionPath,
  agent,
  sessionId,
  timestamp,
  cliVersion = "0.111.0",
}) {
  const session = await parseSession({ sessionPath, agent });
  const exportedSessionId = sessionId ?? session.sessionId;
  const exportedTimestamp = timestamp ?? session.updatedAt ?? new Date().toISOString();
  const fileName = `rollout-${normalizeIsoForCodexFile(exportedTimestamp)}-${exportedSessionId}.jsonl`;
  const rows = [
    {
      timestamp: exportedTimestamp,
      type: "session_meta",
      payload: {
        id: exportedSessionId,
        timestamp: exportedTimestamp,
        cwd: session.cwd,
        originator: "codex_cli_rs",
        cli_version: cliVersion,
        source: "cli",
        model_provider: "openai",
        base_instructions: {
          text: "You are Codex, a coding agent based on GPT-5.",
        },
      },
    },
    ...session.messages.map((message) => ({
      timestamp: exportedTimestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: message.role,
        content: toCodexMessageContent(message),
      },
    })),
  ];

  return {
    sessionId: exportedSessionId,
    fileName,
    content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  };
}

export async function renderHandoff({ sessionPath, agent, target = "cursor", session: providedSession = null }) {
  const session = providedSession ?? (await parseSession({ sessionPath, agent }));
  const transcript = session.messages.map((message) => `[${message.role}] ${message.text}`).join("\n\n");
  const metadata = [];
  if (session.title) {
    metadata.push(`Conversation Title: ${session.title}`);
  }
  if (session.updatedAt) {
    metadata.push(`Last Updated: ${session.updatedAt}`);
  }

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
    ...metadata,
    "",
    "## Suggested Next Step",
    "",
    buildSuggestedNextStep(session),
    "",
    "## Transcript",
    "",
    transcript,
    "",
  ].join("\n");
}

export async function renderStartPrompt({ handoffPath, target = "cursor" }) {
  return [
    "You are continuing work from another coding agent.",
    "",
    "First, read this handoff file:",
    handoffPath,
    "",
    "Instructions:",
    "1. Read the handoff file fully.",
    "2. Summarize the current task, constraints, and likely next step in 5-10 lines.",
    "3. Treat the handoff as context, not ground truth. Verify against the current repository before making changes.",
    "4. Continue the task from the most likely unfinished point.",
    "5. If the handoff is incomplete or inconsistent with the codebase, say so clearly before proceeding.",
    `6. Continue the work in ${target} mode, but prioritize the repository state over the historical transcript.`,
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
