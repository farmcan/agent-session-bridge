import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  detectAgent,
  findLatestSession,
  parseSession,
  renderHandoff,
  supportedAgents,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("supportedAgents exposes the real adapter set", () => {
  assert.deepEqual(supportedAgents.sort(), ["codex", "cursor", "qoder", "qodercli"].sort());
});

test("detectAgent recognizes Codex, Qoder, QoderCLI alias, and Cursor paths", () => {
  assert.equal(detectAgent("/tmp/.codex/sessions/2026/03/demo.jsonl"), "codex");
  assert.equal(detectAgent("/tmp/.qoder/projects/demo.jsonl"), "qoder");
  assert.equal(detectAgent("/tmp/.qoder/bin/qodercli/demo.jsonl"), "qodercli");
  assert.equal(detectAgent("/tmp/.cursor/projects/foo/agent-transcripts/id/session.jsonl"), "cursor");
  assert.equal(detectAgent("/tmp/.claude/projects/foo.jsonl"), null);
  assert.equal(detectAgent("/tmp/.augment/sessions/foo.jsonl"), null);
});

test("parseSession reads a Codex session", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const session = await parseSession({ sessionPath, agent: "codex" });

  assert.equal(session.agent, "codex");
  assert.equal(session.sessionId, "sample-session");
  assert.equal(session.cwd, "/tmp/demo");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].role, "user");
});

test("parseSession reads a Qoder session and drops meta messages", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const session = await parseSession({ sessionPath, agent: "qoder" });

  assert.equal(session.agent, "qoder");
  assert.equal(session.sessionId, "qoder-session");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].text, "你好");
  assert.equal(session.messages[1].role, "assistant");
});

test("parseSession reads a Cursor transcript", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-cursor-session.jsonl");
  const session = await parseSession({ sessionPath, agent: "cursor" });

  assert.equal(session.agent, "cursor");
  assert.equal(session.messages.length, 4);
  assert.match(session.messages[0].text, /看看 \.gitignore/);
});

test("renderHandoff produces a generic cross-agent handoff", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const output = await renderHandoff({ sessionPath, agent: "qoder", target: "cursor" });

  assert.match(output, /# Agent Session Handoff/);
  assert.match(output, /Source Agent: qoder/);
  assert.match(output, /Target Agent: cursor/);
  assert.match(output, /\[user\] 你好/);
  assert.doesNotMatch(output, /<command-message>/);
});

test("findLatestSession returns the newest jsonl file for a given agent root", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const latest = await findLatestSession(sessionsRoot);

  assert.equal(path.basename(latest), "rollout-2026-03-19T12-00-00-later.jsonl");
});

test("cli --stdout prints a handoff from an explicit qodercli alias", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--agent", "qodercli", "--session", sessionPath, "--target", "cursor", "--stdout"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Source Agent: qodercli/);
  assert.equal(result.stderr, "");
});

test("cli fails clearly for unsupported agents", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "--agent", "claude", "--session", sessionPath, "--stdout"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unsupported agent: claude/);
});
