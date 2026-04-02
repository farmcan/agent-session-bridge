import { parseSession } from "./adapters/sources/index.js";
import { renderClaudeSessionExport } from "./adapters/targets/claude-session.js";
import { renderCodexSessionExport } from "./adapters/targets/codex-session.js";
import { detectAgent, formatAgentName, getDefaultRoot, supportedAgents } from "./core/agents.js";
import { findLatestSession, findMatchingSessions, findSessionById } from "./core/discovery.js";
import { forkSession, splitSession } from "./core/session-transforms.js";
import { buildStoryPayload } from "./core/story-events.js";

export {
  buildStoryPayload,
  detectAgent,
  findLatestSession,
  findMatchingSessions,
  findSessionById,
  forkSession,
  formatAgentName,
  getDefaultRoot,
  parseSession,
  splitSession,
  supportedAgents,
};

export async function renderCodexResumeExport({
  sessionPath,
  agent,
  sessionId,
  timestamp,
  cliVersion = "0.111.0",
}) {
  const session = await parseSession({ sessionPath, agent });
  const exported = renderCodexSessionExport({
    session,
    sessionId,
    timestamp,
    cliVersion,
  });

  return {
    sessionId: exported.sessionId,
    fileName: exported.fileName,
    content: exported.files[0].content,
  };
}

export async function renderClaudeResumeExport({
  sessionPath,
  agent,
  sessionId,
  timestamp,
  version = "2.1.79",
}) {
  const session = await parseSession({ sessionPath, agent });
  const exported = renderClaudeSessionExport({
    session,
    sessionId,
    timestamp,
    version,
  });

  return {
    sessionId: exported.sessionId,
    projectKey: exported.projectKey,
    fileName: exported.fileName,
    content: exported.files[0].content,
  };
}
