export function isSkippableSplitUserMessage(message) {
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
    rawItems: null,
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
    rawItems: null,
    messages: [...session.messages, { role: "user", text: forkPrompt }],
  };
}
