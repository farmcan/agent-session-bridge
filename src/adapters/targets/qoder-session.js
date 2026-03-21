function toQoderMessageContent(message) {
  return [{ type: "text", text: message.text }];
}

export function renderQoderSessionExport({
  session,
  sessionId,
  timestamp,
  version = "0.1.29",
}) {
  const exportedSessionId = sessionId ?? session.sessionId;
  const exportedTimestamp = timestamp ?? session.updatedAt ?? new Date().toISOString();
  const jsonlFileName = `${exportedSessionId}.jsonl`;
  const sidecarFileName = `${exportedSessionId}-session.json`;

  const rows = session.messages.map((message, index) => ({
    uuid: `m${index + 1}`,
    parentUuid: index === 0 ? "" : `m${index}`,
    isSidechain: false,
    userType: "external",
    cwd: session.cwd,
    sessionId: exportedSessionId,
    version,
    agentId: "agent-session-bridge",
    type: message.role === "assistant" ? "assistant" : "user",
    timestamp: exportedTimestamp,
    message: {
      role: message.role === "assistant" ? "assistant" : "user",
      content: toQoderMessageContent(message),
      id: `mid-${index + 1}`,
    },
    isMeta: false,
  }));

  const sidecar = {
    id: exportedSessionId,
    parent_session_id: "",
    title: session.title ?? `Imported ${session.agent} session`,
    message_count: session.messages.length,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost: 0,
    created_at: Date.parse(exportedTimestamp),
    updated_at: Date.parse(exportedTimestamp),
    working_dir: session.cwd,
    quest: false,
    total_prompt_tokens: 0,
    total_completed_tokens: 0,
    total_cached_tokens: 0,
    total_model_call_times: Math.max(session.messages.filter((message) => message.role === "assistant").length, 1),
    total_tool_call_times: 0,
    context_usage_ratio: 0,
  };

  return {
    mode: "qoder-session",
    sessionId: exportedSessionId,
    fileName: jsonlFileName,
    files: [
      { key: "main", fileName: jsonlFileName, content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` },
      { key: "sidecar", fileName: sidecarFileName, content: `${JSON.stringify(sidecar)}\n` },
    ],
  };
}
