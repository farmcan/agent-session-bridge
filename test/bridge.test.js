import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

import {
  detectAgent,
  findLatestSession,
  parseSession,
  renderHandoff,
  renderStartPrompt,
  supportedAgents,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

test("supportedAgents exposes the real adapter set", () => {
  assert.deepEqual(supportedAgents.sort(), ["claude", "codex", "cursor", "qoder", "qodercli"].sort());
});

test("detectAgent recognizes Codex, Qoder, QoderCLI alias, and Cursor paths", () => {
  assert.equal(detectAgent("/tmp/.codex/sessions/2026/03/demo.jsonl"), "codex");
  assert.equal(detectAgent("/tmp/.qoder/projects/demo.jsonl"), "qoder");
  assert.equal(detectAgent("/tmp/.qoder/bin/qodercli/demo.jsonl"), "qodercli");
  assert.equal(detectAgent("/tmp/.cursor/projects/foo/agent-transcripts/id/session.jsonl"), "cursor");
  assert.equal(detectAgent("/tmp/.claude/projects/foo.jsonl"), "claude");
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
  assert.equal(session.title, "Demo Qoder Session");
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

test("parseSession reads a Claude project transcript", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const session = await parseSession({ sessionPath, agent: "claude" });

  assert.equal(session.agent, "claude");
  assert.equal(session.sessionId, "claude-session");
  assert.equal(session.cwd, "/workspace/claude-demo");
  assert.equal(session.messages.length, 3);
  assert.equal(session.messages[0].role, "user");
  assert.match(session.messages[1].text, /你好/);
});

test("renderHandoff produces a generic cross-agent handoff", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const output = await renderHandoff({ sessionPath, agent: "qoder", target: "cursor" });

  assert.match(output, /# Agent Session Handoff/);
  assert.match(output, /Source Agent: qoder/);
  assert.match(output, /Target Agent: cursor/);
  assert.match(output, /Conversation Title: Demo Qoder Session/);
  assert.match(output, /## Suggested Next Step/);
  assert.match(output, /\[user\] 你好/);
  assert.doesNotMatch(output, /<command-message>/);
});

test("renderStartPrompt points the next agent at the handoff file", async () => {
  const prompt = await renderStartPrompt({
    handoffPath: "./agent-handoff-demo.md",
    target: "cursor",
  });

  assert.match(prompt, /You are continuing work from another coding agent\./);
  assert.match(prompt, /First, read this handoff file:/);
  assert.match(prompt, /\.\/agent-handoff-demo\.md/);
  assert.match(prompt, /Treat the handoff as context, not ground truth\./);
});

test("findLatestSession returns the newest jsonl file for a given agent root", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const latest = await findLatestSession(sessionsRoot);

  assert.equal(path.basename(latest), "rollout-2026-03-19T12-00-00-later.jsonl");
});

test("findLatestSession prefers sessions whose cwd matches the current directory", async () => {
  const currentDir = await makeTempDir("workspace-a");
  const otherDir = await makeTempDir("workspace-b");
  const sessionsRoot = await makeTempDir("codex-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "19");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-19T11-00-00-workspace-a.jsonl"),
    `{"timestamp":"2026-03-19T11:00:00.000Z","type":"session_meta","payload":{"id":"workspace-a","cwd":"${currentDir}"}}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-19T12-00-00-workspace-b.jsonl"),
    `{"timestamp":"2026-03-19T12:00:00.000Z","type":"session_meta","payload":{"id":"workspace-b","cwd":"${otherDir}"}}\n`,
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "codex" });

  assert.equal(path.basename(latest), "rollout-2026-03-19T11-00-00-workspace-a.jsonl");
});

test("findLatestSession prefers Claude sessions whose cwd matches the current directory", async () => {
  const currentDir = await makeTempDir("claude-workspace-a");
  const otherDir = await makeTempDir("claude-workspace-b");
  const sessionsRoot = await makeTempDir("claude-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":"hi"},"uuid":"1","timestamp":"2026-03-20T10:00:00.000Z","cwd":"${otherDir}","sessionId":"aaa","version":"2.1.79"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":"hi"},"uuid":"1","timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb","version":"2.1.79"}\n`,
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "claude" });

  assert.equal(path.basename(latest), "bbb.jsonl");
});

test("findLatestSession prefers the Cursor project derived from the current directory", async () => {
  const currentDir = await makeTempDir("cursor-workspace-a");
  const otherDir = await makeTempDir("cursor-workspace-b");
  const sessionsRoot = await makeTempDir("cursor-projects");
  const currentKey = currentDir.split(path.sep).filter(Boolean).join("-");
  const otherKey = otherDir.split(path.sep).filter(Boolean).join("-");
  await fs.mkdir(path.join(sessionsRoot, currentKey, "agent-transcripts", "session-a"), { recursive: true });
  await fs.mkdir(path.join(sessionsRoot, otherKey, "agent-transcripts", "session-b"), { recursive: true });
  await fs.writeFile(
    path.join(sessionsRoot, currentKey, "agent-transcripts", "session-a", "session-a.jsonl"),
    '{"role":"user","message":{"content":[{"type":"text","text":"<user_query>\\nworkspace a\\n</user_query>"}]}}\n',
    "utf8",
  );
  await fs.writeFile(
    path.join(sessionsRoot, otherKey, "agent-transcripts", "session-b", "session-b.jsonl"),
    '{"role":"user","message":{"content":[{"type":"text","text":"<user_query>\\nworkspace b\\n</user_query>"}]}}\n',
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "cursor" });

  assert.equal(path.basename(latest), "session-a.jsonl");
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

test("cli writes both a handoff file and a start prompt file", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("handoff-out");
  const handoffPath = path.join(outDir, "handoff.md");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--agent", "qoder", "--session", sessionPath, "--target", "cursor", "--out", handoffPath],
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

  const promptPath = path.join(outDir, "handoff.start.txt");
  const handoff = await fs.readFile(handoffPath, "utf8");
  const prompt = await fs.readFile(promptPath, "utf8");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /handoff\.md/);
  assert.match(result.stdout, /handoff\.start\.txt/);
  assert.equal(result.stderr, "");
  assert.match(handoff, /Conversation Title: Demo Qoder Session/);
  assert.match(prompt, /\.\/handoff\.md/);
});

test("cli fails clearly for unsupported agents", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "--agent", "augment", "--session", sessionPath, "--stdout"], {
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
  assert.match(result.stderr, /Unsupported agent: augment/);
});
