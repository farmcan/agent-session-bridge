import path from "node:path";

import { formatAgentName } from "../../core/agents.js";
import { isSkippableSplitUserMessage } from "../../core/session-transforms.js";

function buildSuggestedNextStep(session) {
  const lastUserMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === "user" && !isSkippableSplitUserMessage(message));
  if (!lastUserMessage) {
    return "Read the transcript, inspect the current repository state, and continue from the most likely unfinished point.";
  }

  return `Start by checking the latest user request: "${lastUserMessage.text}". Verify it against the current repository, then continue from the most likely unfinished point.`;
}

export function renderHandoff({ sessionPath, sourceAgent, targetAgent, session }) {
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
    `Source Agent: ${formatAgentName(sourceAgent ?? session.agent)}`,
    `Target Agent: ${formatAgentName(targetAgent)}`,
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

export function renderStartPrompt({ handoffPath, target = "cursor" }) {
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

export function renderHandoffExport({ sessionPath, sourceAgent, targetAgent, session }) {
  const baseName = path.basename(sessionPath, ".jsonl");
  const mainFileName = `agent-handoff-${baseName}.md`;
  const promptFileName = `agent-handoff-${baseName}.start.txt`;
  const content = renderHandoff({ sessionPath, sourceAgent, targetAgent, session });
  const prompt = renderStartPrompt({
    handoffPath: `./${mainFileName}`,
    target: targetAgent,
  });

  return {
    mode: "handoff",
    sessionId: session.sessionId,
    files: [
      { key: "main", fileName: mainFileName, content },
      { key: "prompt", fileName: promptFileName, content: prompt },
    ],
  };
}
