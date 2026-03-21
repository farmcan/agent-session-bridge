function normalizeIsoForCodexFile(timestamp) {
  return timestamp.replace(/:/gu, "-").replace(/\./gu, "-");
}

function toCodexMessageContent(message) {
  if (message.role === "assistant") {
    return [{ type: "output_text", text: message.text }];
  }
  return [{ type: "input_text", text: message.text }];
}

export function renderCodexSessionExport({
  session,
  sessionId,
  timestamp,
  cliVersion = "0.111.0",
}) {
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
    mode: "codex-session",
    sessionId: exportedSessionId,
    fileName,
    files: [{ key: "main", fileName, content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` }],
  };
}
