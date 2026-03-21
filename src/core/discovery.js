import path from "node:path";

import { detectAgent, getDefaultRoot, normalizeAgent } from "./agents.js";
import { samePath, walk } from "./files.js";
import { parseSession, readSessionCwd } from "../adapters/sources/index.js";

function toCursorProjectKey(cwd) {
  return path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-");
}

function fileLooksLikeSessionId(filePath, sessionId) {
  const baseName = path.basename(filePath, ".jsonl");
  if (baseName === sessionId) {
    return true;
  }
  return baseName.endsWith(`-${sessionId}`);
}

export async function findLatestSession(rootDir = getDefaultRoot("codex"), options = {}) {
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

  for (const filePath of [...sortedFiles].reverse()) {
    const sessionCwd = await readSessionCwd(filePath, agent);
    if (sessionCwd && (await samePath(sessionCwd, cwd))) {
      return filePath;
    }
  }

  return sortedFiles.at(-1);
}

export async function findMatchingSessions(rootDir = getDefaultRoot("codex"), options = {}) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const sortedFiles = files.sort();
  const cwd = options.cwd ?? null;
  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(sortedFiles[0]);

  if (!cwd || !agent) {
    return sortedFiles;
  }

  if (agent === "cursor") {
    const projectKey = toCursorProjectKey(cwd);
    return sortedFiles.filter((filePath) => filePath.includes(`${path.sep}${projectKey}${path.sep}`));
  }

  const matches = [];
  for (const filePath of sortedFiles) {
    const sessionCwd = await readSessionCwd(filePath, agent);
    if (sessionCwd && (await samePath(sessionCwd, cwd))) {
      matches.push(filePath);
    }
  }

  return matches;
}

export async function findSessionById(rootDir = getDefaultRoot("codex"), options = {}) {
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
