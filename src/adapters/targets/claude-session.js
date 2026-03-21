import path from "node:path";

function toClaudeProjectKey(cwd) {
  return `-${path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-")}`;
}

function toClaudeMessageContent(message) {
  if (message.role === "assistant") {
    return [{ type: "text", text: message.text }];
  }
  return message.text;
}

export function renderClaudeSessionExport({
  session,
  sessionId,
  timestamp,
  version = "2.1.79",
}) {
  const exportedSessionId = sessionId ?? session.sessionId;
  const exportedTimestamp = timestamp ?? session.updatedAt ?? new Date().toISOString();
  const projectKey = toClaudeProjectKey(session.cwd);
  const fileName = `${exportedSessionId}.jsonl`;
  const baseRows = session.messages.map((message, index) => {
    const uuid = `m${index + 1}`;
    const parentUuid = index === 0 ? null : `m${index}`;
    if (message.role === "assistant") {
      return {
        parentUuid,
        isSidechain: false,
        message: {
          id: uuid,
          role: "assistant",
          type: "message",
          content: toClaudeMessageContent(message),
        },
        type: "assistant",
        uuid,
        timestamp: exportedTimestamp,
        cwd: session.cwd,
        sessionId: exportedSessionId,
        version,
      };
    }

    return {
      parentUuid,
      isSidechain: false,
      type: "user",
      message: {
        role: "user",
        content: toClaudeMessageContent(message),
      },
      uuid,
      timestamp: exportedTimestamp,
      cwd: session.cwd,
      sessionId: exportedSessionId,
      version,
    };
  });

  const firstUserRow = baseRows.find((row) => row.type === "user");
  const rows = [];
  if (firstUserRow) {
    rows.push({
      type: "file-history-snapshot",
      messageId: firstUserRow.uuid,
      snapshot: {
        messageId: firstUserRow.uuid,
        trackedFileBackups: {},
        timestamp: exportedTimestamp,
      },
      isSnapshotUpdate: false,
    });
  }
  rows.push(...baseRows);

  return {
    mode: "claude-session",
    sessionId: exportedSessionId,
    projectKey,
    fileName,
    files: [{ key: "main", fileName, content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` }],
  };
}
