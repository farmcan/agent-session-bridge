import { randomUUID } from "node:crypto";

import { formatAgentName, normalizeAgent } from "./agents.js";
import { forkSession, splitSession } from "./session-transforms.js";
import { parseSession } from "../adapters/sources/index.js";
import { renderExport } from "../adapters/targets/index.js";

function applySessionTransforms(session, options) {
  let nextSession = session;
  if (options.splitRecent) {
    nextSession = splitSession(nextSession, { recentUserTurns: options.splitRecent });
  }
  if (options.forkPrompt) {
    nextSession = forkSession(nextSession, { prompt: options.forkPrompt });
  }
  return nextSession;
}

export async function exportSession({
  sessionPath,
  sourceAgent,
  targetAgent,
  format,
  splitRecent = null,
  forkPrompt = null,
  sessionId = undefined,
}) {
  const parsedSession = await parseSession({ sessionPath, agent: sourceAgent });
  const session = applySessionTransforms(parsedSession, { splitRecent, forkPrompt });
  const normalizedSource = formatAgentName(sourceAgent ?? parsedSession.agent);
  const normalizedTarget = formatAgentName(targetAgent);
  const exportedSessionId =
    sessionId ??
    (normalizeAgent(sourceAgent ?? parsedSession.agent) === "codex" &&
    normalizeAgent(targetAgent) === "codex" &&
    format === "codex-session"
      ? randomUUID()
      : undefined);
  const exported = renderExport(format, {
    sessionPath,
    sourceAgent,
    targetAgent,
    session,
    sessionId: exportedSessionId,
  });

  return {
    ...exported,
    sourceAgent: normalizedSource,
    targetAgent: normalizedTarget,
    sessionPath,
    sessionId: exported.sessionId,
    session,
  };
}

export { forkSession, splitSession };
