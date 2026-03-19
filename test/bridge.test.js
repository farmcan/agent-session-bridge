import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLatestSession, renderCursorPrompt } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("renderCursorPrompt flattens a Codex session into a Cursor handoff", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-session.jsonl");
  const output = await renderCursorPrompt(sessionPath);

  assert.match(output, /# Codex Session Handoff/);
  assert.match(output, /Session ID: sample-session/);
  assert.match(output, /\[user\] Please add a dark mode toggle\./);
  assert.match(output, /\[assistant\] I found the settings panel and will add the toggle there\./);
  assert.doesNotMatch(output, /commentary/);
});

test("findLatestSession returns the newest jsonl file", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const latest = await findLatestSession(sessionsRoot);

  assert.equal(path.basename(latest), "rollout-2026-03-19T12-00-00-later.jsonl");
});
