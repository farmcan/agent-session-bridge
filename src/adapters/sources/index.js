import { detectAgent, normalizeAgent } from "../../core/agents.js";
import { readJsonl } from "../../core/files.js";
import * as claude from "./claude.js";
import * as codex from "./codex.js";
import * as cursor from "./cursor.js";
import * as qoder from "./qoder.js";

const adapters = {
  claude,
  codex,
  cursor,
  qoder,
  qodercli: qoder,
};

export function getSourceAdapter(agent) {
  const resolvedAgent = normalizeAgent(agent);
  const adapter = adapters[resolvedAgent];
  if (!adapter) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }
  return adapter;
}

export async function parseSession({ sessionPath, agent }) {
  const resolvedAgent = normalizeAgent(agent) ?? detectAgent(sessionPath);
  const adapter = getSourceAdapter(resolvedAgent);
  const items = await readJsonl(sessionPath);
  return adapter.parse(items, sessionPath, resolvedAgent);
}

export async function readSessionCwd(sessionPath, agent) {
  const resolvedAgent = normalizeAgent(agent) ?? detectAgent(sessionPath);
  const adapter = getSourceAdapter(resolvedAgent);
  const items = await readJsonl(sessionPath);
  return adapter.readSessionCwd(items, sessionPath, resolvedAgent);
}
