import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

import { chooseClaudeSessionPath, getClipboardCommandCandidates } from "../src/cli.js";
import { exportSession } from "../src/core/exporting.js";
import { getExportCapability, inferDefaultExportFormat } from "../src/core/routing.js";
import {
  detectAgent,
  findMatchingSessions,
  findLatestSession,
  findSessionById,
  forkSession,
  parseSession,
  renderClaudeResumeExport,
  renderCodexResumeExport,
  renderHandoff,
  renderStartPrompt,
  splitSession,
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

test("inferDefaultExportFormat prefers native exports for primary aliases", () => {
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2c", exportFormat: null, handoff: false }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2x", exportFormat: null, handoff: false }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2x", exportFormat: null, handoff: false }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2x", exportFormat: null, handoff: false }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2c", exportFormat: null, handoff: false }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2q", exportFormat: null, handoff: false }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2q", exportFormat: null, handoff: false }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2c", exportFormat: null, handoff: true }).exportFormat, null);
});

test("getExportCapability exposes registered qoder export pairs", () => {
  assert.equal(getExportCapability("qodercli", "codex")?.format, "codex-session");
  assert.equal(getExportCapability("qodercli", "claude")?.format, "claude-session");
  assert.equal(getExportCapability("codex", "qodercli")?.format, "qoder-session");
  assert.equal(getExportCapability("claude", "qodercli")?.format, "qoder-session");
});

test("cli shorthand agent names map to the expected backends", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c", "x", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: claude/);
  assert.match(result.stdout, /Target Agent: codex/);
  assert.equal(result.stderr, "");
});

test("cli --help prints usage and exits without generating files", async () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "--help"], {
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

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /agent-session-bridge/);
  assert.equal(result.stderr, "");
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

test("parseSession drops Codex developer and system messages", async () => {
  const tempDir = await makeTempDir("codex-filter");
  const sessionPath = path.join(tempDir, "rollout-demo.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"demo","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"developer note"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"system","content":[{"type":"input_text","text":"system note"}]}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"real user request"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });

  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0].role, "user");
  assert.match(session.messages[0].text, /real user request/);
});

test("parseSession drops Codex AGENTS bootstrap messages", async () => {
  const tempDir = await makeTempDir("codex-agents-filter");
  const sessionPath = path.join(tempDir, "rollout-demo.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"demo","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /tmp/demo\\n\\n<INSTRUCTIONS>\\nProject rules\\n</INSTRUCTIONS>"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"real user request"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });

  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0].role, "user");
  assert.match(session.messages[0].text, /real user request/);
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

test("renderHandoff normalizes shorthand agent names to full names", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const output = await renderHandoff({ sessionPath, agent: "q", target: "x" });

  assert.match(output, /Source Agent: qoder/);
  assert.match(output, /Target Agent: codex/);
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

test("renderCodexResumeExport converts a Claude transcript into Codex response items", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const exported = await renderCodexResumeExport({
    sessionPath,
    agent: "claude",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
    cliVersion: "0.111.0",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.equal(
    exported.fileName,
    "rollout-2026-03-20T09-16-47-246Z-11111111-2222-4333-8444-555555555555.jsonl",
  );

  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "session_meta");
  assert.equal(lines[0].payload.id, "11111111-2222-4333-8444-555555555555");
  assert.equal(lines[0].payload.cwd, "/workspace/claude-demo");
  assert.equal(lines[1].type, "response_item");
  assert.equal(lines[1].payload.role, "user");
  assert.equal(lines[1].payload.content[0].type, "input_text");
  assert.equal(lines[2].payload.role, "assistant");
  assert.equal(lines[2].payload.content[0].type, "output_text");
  assert.ok(lines.every((line) => line.type !== "event_msg"));
});

test("renderClaudeResumeExport converts a Codex transcript into Claude-style user and assistant rows", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const exported = await renderClaudeResumeExport({
    sessionPath,
    agent: "codex",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
    version: "2.1.79",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.equal(exported.projectKey, "-tmp-demo");
  assert.equal(exported.fileName, "11111111-2222-4333-8444-555555555555.jsonl");

  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "file-history-snapshot");
  assert.equal(lines[1].type, "user");
  assert.equal(lines[1].sessionId, "11111111-2222-4333-8444-555555555555");
  assert.equal(lines[1].cwd, "/tmp/demo");
  assert.equal(lines[1].message.role, "user");
  assert.equal(lines[1].message.content, "Please add a dark mode toggle.");
  assert.equal(lines[2].type, "assistant");
  assert.equal(lines[2].message.role, "assistant");
  assert.equal(lines[2].message.content[0].type, "text");
  assert.match(lines[2].message.content[0].text, /settings panel/);
});

test("exportSession renders qodercli -> codex as a Codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const exported = await exportSession({
    sessionPath,
    sourceAgent: "qodercli",
    targetAgent: "codex",
    format: "codex-session",
  });

  assert.equal(exported.mode, "codex-session");
  assert.equal(exported.sourceAgent, "qodercli");
  assert.equal(exported.targetAgent, "codex");
  assert.equal(exported.sessionId, "qoder-session");
  assert.equal(exported.files.length, 1);
  assert.match(exported.files[0].content, /session_meta/);
});

test("exportSession renders qodercli -> claude as a Claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const exported = await exportSession({
    sessionPath,
    sourceAgent: "qodercli",
    targetAgent: "claude",
    format: "claude-session",
  });

  assert.equal(exported.mode, "claude-session");
  assert.equal(exported.sourceAgent, "qodercli");
  assert.equal(exported.targetAgent, "claude");
  assert.equal(exported.sessionId, "qoder-session");
  assert.equal(exported.files.length, 1);
  assert.match(exported.files[0].content, /"type":"user"/);
});

test("exportSession renders codex -> qodercli as a qoder session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const exported = await exportSession({
    sessionPath,
    sourceAgent: "codex",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.sourceAgent, "codex");
  assert.equal(exported.targetAgent, "qodercli");
  assert.equal(exported.files.length, 2);
  assert.match(exported.files[0].fileName, /\.jsonl$/);
  assert.match(exported.files[1].fileName, /-session\.json$/);
});

test("exportSession renders claude -> qodercli as a qoder session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const exported = await exportSession({
    sessionPath,
    sourceAgent: "claude",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.sourceAgent, "claude");
  assert.equal(exported.targetAgent, "qodercli");
  assert.equal(exported.files.length, 2);
  assert.match(exported.files[0].content, /"type":"user"/);
});

test("splitSession keeps only the most recent user turn and following messages", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const session = await parseSession({ sessionPath, agent: "claude" });
  const split = splitSession(session, { recentUserTurns: 1 });

  assert.equal(split.messages.length, 1);
  assert.equal(split.messages[0].role, "user");
  assert.match(split.messages[0].text, /帮我总结当前目录/);
});

test("splitSession ignores interruption placeholders when finding the latest user turn", () => {
  const split = splitSession(
    {
      agent: "claude",
      sessionId: "demo",
      cwd: "/tmp/demo",
      messages: [
        { role: "user", text: "先修一下 README" },
        { role: "assistant", text: "我先看一下当前文档结构。" },
        { role: "user", text: "真正的新需求是把 split 做出来" },
        { role: "user", text: "[Request interrupted by user]" },
      ],
    },
    { recentUserTurns: 1 },
  );

  assert.equal(split.messages.length, 1);
  assert.equal(split.messages[0].role, "user");
  assert.match(split.messages[0].text, /真正的新需求/);
});

test("forkSession appends a new user idea to continue in a separate thread", () => {
  const forked = forkSession(
    {
      agent: "codex",
      sessionId: "demo",
      cwd: "/tmp/demo",
      messages: [
        { role: "user", text: "先完成首页重构" },
        { role: "assistant", text: "我已经定位到首页入口文件。" },
      ],
    },
    { prompt: "另外开一条线，研究 session split 的设计" },
  );

  assert.equal(forked.messages.length, 3);
  assert.equal(forked.messages.at(-1).role, "user");
  assert.match(forked.messages.at(-1).text, /session split 的设计/);
});

test("renderHandoff ignores interruption placeholders in the suggested next step", async () => {
  const output = await renderHandoff({
    sessionPath: "/tmp/demo.jsonl",
    agent: "claude",
    target: "cursor",
    session: {
      agent: "claude",
      sessionId: "demo",
      sessionPath: "/tmp/demo.jsonl",
      cwd: "/tmp/demo",
      title: null,
      updatedAt: null,
      messages: [
        { role: "user", text: "真正的新需求是把 split 做出来" },
        { role: "user", text: "[Request interrupted by user]" },
      ],
    },
  });

  assert.match(output, /真正的新需求是把 split 做出来/);
  assert.doesNotMatch(output, /Start by checking the latest user request: "\\[Request interrupted by user\\]"/);
});

test("findLatestSession returns the newest jsonl file for a given agent root", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const latest = await findLatestSession(sessionsRoot);

  assert.equal(path.basename(latest), "rollout-2026-03-19T12-00-00-later.jsonl");
});

test("findSessionById finds a Codex session by filename id", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const match = await findSessionById(sessionsRoot, {
    agent: "codex",
    sessionId: "later",
  });

  assert.equal(path.basename(match), "rollout-2026-03-19T12-00-00-later.jsonl");
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

test("findMatchingSessions returns all Claude sessions whose cwd matches the current directory", async () => {
  const currentDir = await makeTempDir("claude-match-workspace");
  const otherDir = await makeTempDir("claude-other-workspace");
  const sessionsRoot = await makeTempDir("claude-match-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "ccc.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T12:00:00.000Z","cwd":"${otherDir}","sessionId":"ccc"}\n`,
    "utf8",
  );

  const matches = await findMatchingSessions(sessionsRoot, { cwd: currentDir, agent: "claude" });

  assert.deepEqual(
    matches.map((filePath) => path.basename(filePath)),
    ["aaa.jsonl", "bbb.jsonl"],
  );
});

test("findLatestSession returns on the newest cwd match without reading older unrelated sessions", async () => {
  const currentDir = await makeTempDir("codex-short-circuit-workspace");
  const sessionsRoot = await makeTempDir("codex-short-circuit-sessions");
  await fs.mkdir(path.join(sessionsRoot, "2026", "03"), { recursive: true });
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "aaa.jsonl"),
    '{"type":"session_meta","payload":{"id":"aaa","cwd":"/tmp/other"}}\nnot-json\n',
    "utf8",
  );
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "bbb.jsonl"),
    `{"type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}\n`,
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "codex" });

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

test("cli supports shorthand positional source and target agents", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x", "r", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: codex/);
  assert.match(result.stdout, /Target Agent: cursor/);
  assert.equal(result.stderr, "");
});

test("cli supports built-in route aliases like x2r", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: codex/);
  assert.match(result.stdout, /Target Agent: cursor/);
  assert.equal(result.stderr, "");
});

test("cli supports built-in route aliases like x2c as Claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("x2c-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "x2c", "--session", sessionPath, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: fakeHome },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "claude-session");
  assert.equal(payload.sourceAgent, "codex");
  assert.equal(payload.targetAgent, "claude");
  assert.equal(payload.resumeCommand, "claude --resume sample-session");
});

test("cli supports built-in route aliases like c2x as Codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("c2x-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "c2x", "--session", sessionPath, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: fakeHome },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.sourceAgent, "claude");
  assert.equal(payload.targetAgent, "codex");
  assert.equal(payload.resumeCommand, "codex resume claude-session");
});

test("cli supports built-in route aliases like x2x as Codex fork export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("x2x-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "x2x", "--session", sessionPath, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: fakeHome },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.sourceAgent, "codex");
  assert.equal(payload.targetAgent, "codex");
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(payload.sessionId, "sample-session");
  assert.match(payload.resumeCommand, /^codex resume /);
});

test("cli supports built-in route aliases like c2r", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c2r", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: claude/);
  assert.match(result.stdout, /Target Agent: cursor/);
  assert.equal(result.stderr, "");
});

test("cli supports built-in route aliases like q2x as Codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("q2x-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "q2x", "--session", sessionPath, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: fakeHome },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.sourceAgent, "qoder");
  assert.equal(payload.targetAgent, "codex");
  assert.equal(payload.resumeCommand, "codex resume qoder-session");
});

test("cli supports built-in route aliases like q2c as Claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("q2c-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "q2c", "--session", sessionPath, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: fakeHome },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "claude-session");
  assert.equal(payload.sourceAgent, "qoder");
  assert.equal(payload.targetAgent, "claude");
  assert.equal(payload.resumeCommand, "claude --resume qoder-session");
});

test("cli supports built-in route aliases like x2q as qoder session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "x2q", "--session", sessionPath, "--json"], {
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "qoder-session");
  assert.equal(payload.sourceAgent, "codex");
  assert.equal(payload.targetAgent, "qoder");
  assert.equal(payload.resumeCommand, undefined);
  assert.match(payload.sidecarPath, /-session\.json$/);
});

test("cli supports built-in route aliases like c2q as qoder session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "c2q", "--session", sessionPath, "--json"], {
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "qoder-session");
  assert.equal(payload.sourceAgent, "claude");
  assert.equal(payload.targetAgent, "qoder");
  assert.equal(payload.resumeCommand, undefined);
  assert.match(payload.sidecarPath, /-session\.json$/);
});

test("cli supports --handoff to force the old handoff behavior for x2c", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "x2c", "--session", sessionPath, "--handoff", "--json"], {
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "handoff");
  assert.equal(payload.targetAgent, "claude");
});

test("cli runs correctly when invoked through a symlinked entrypoint", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const realCliPath = path.join(__dirname, "..", "src", "cli.js");
  const tempDir = await makeTempDir("cli-symlink");
  const symlinkPath = path.join(tempDir, "agent-session-bridge");

  await fs.symlink(realCliPath, symlinkPath);

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [symlinkPath, "claude", "codex", "--session", sessionPath, "--export", "codex-session"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
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
  assert.match(result.stdout, /codex resume claude-session/);
  assert.equal(result.stderr, "");
});

test("chooseClaudeSessionPath fails clearly when multiple matches exist in non-interactive mode", async () => {
  await assert.rejects(
    chooseClaudeSessionPath(
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title: "修一下登录页的 loading 状态",
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: "把 session bridge 做成可 resume",
        },
      ],
      { isInteractive: false },
    ),
    /Multiple Claude sessions match the current directory/,
  );
});

test("chooseClaudeSessionPath returns the selected session in interactive mode", async () => {
  const writes = [];
  const selected = await chooseClaudeSessionPath(
    [
      {
        sessionPath: "/tmp/a.jsonl",
        sessionId: "aaa",
        updatedAt: "2026-03-21T10:00:00.000Z",
        title: "修一下登录页的 loading 状态",
      },
      {
        sessionPath: "/tmp/b.jsonl",
        sessionId: "bbb",
        updatedAt: "2026-03-21T11:00:00.000Z",
        title: "把 session bridge 做成可 resume",
      },
    ],
    {
      isInteractive: true,
      output: { write: (chunk) => writes.push(chunk) },
      prompt: async () => "2",
    },
  );

  assert.equal(selected, "/tmp/b.jsonl");
  assert.match(writes.join(""), /Multiple Claude sessions match the current directory/);
  assert.match(
    writes.join(""),
    /1\. 修一下登录页的 loading 状态\n\s+2026-03-21T10:00:00.000Z  aaa\n\s+\/tmp\/a\.jsonl/,
  );
  assert.match(
    writes.join(""),
    /2\. 把 session bridge 做成可 resume\n\s+2026-03-21T11:00:00.000Z  bbb\n\s+\/tmp\/b\.jsonl/,
  );
});

test("chooseClaudeSessionPath truncates long titles for readability", async () => {
  let errorMessage = "";
  await assert.rejects(
    chooseClaudeSessionPath(
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title:
            "这是一个特别特别长的标题，用来确认 Claude session 选择列表不会把整行拉得太长而影响可读性，需要被截断",
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: "短标题",
        },
      ],
      { isInteractive: false },
    ),
    (error) => {
      errorMessage = error.message;
      return /Multiple Claude sessions match the current directory/.test(error.message);
    },
  );

  assert.match(errorMessage, /这是一个特别特别长的标题/);
  assert.match(errorMessage, /\.\.\./);
  assert.match(errorMessage, /\n\s+2026-03-21T10:00:00.000Z  aaa\n\s+\/tmp\/a\.jsonl/);
});

test("cli fails clearly for ambiguous Claude sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("claude-cli-match-workspace");
  const sessionsRoot = await makeTempDir("claude-cli-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "claude", "codex", "--root", sessionsRoot, "--stdout"],
      { cwd: currentDir, stdio: ["ignore", "pipe", "pipe"] },
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

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Multiple Claude sessions match the current directory/);
  assert.match(result.stderr, /--session-id/);
});

test("cli fails clearly for ambiguous Codex sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("codex-cli-match-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "21");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-21T10-00-00-aaa.jsonl"),
    [
      `{"timestamp":"2026-03-21T10:00:00.000Z","type":"session_meta","payload":{"id":"aaa","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-21T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"先修一下 README"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-21T11-00-00-bbb.jsonl"),
    [
      `{"timestamp":"2026-03-21T11:00:00.000Z","type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-21T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一下 Claude export"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "codex", "claude", "--root", sessionsRoot, "--export", "claude-session"],
      { cwd: currentDir, stdio: ["ignore", "pipe", "pipe"] },
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

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Multiple Codex sessions match the current directory/);
  assert.match(result.stderr, /先修一下 README/);
  assert.match(result.stderr, /做一下 Claude export/);
  assert.match(result.stderr, /--session-id/);
});

test("cli supports built-in route aliases like r2c", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-cursor-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "r2c", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: cursor/);
  assert.match(result.stdout, /Target Agent: claude/);
  assert.equal(result.stderr, "");
});

test("getClipboardCommandCandidates prefers platform-native clipboard tools", () => {
  assert.deepEqual(getClipboardCommandCandidates("darwin"), [{ command: "pbcopy", args: [] }]);
  assert.deepEqual(getClipboardCommandCandidates("win32"), [{ command: "clip", args: [] }]);
  assert.deepEqual(getClipboardCommandCandidates("linux"), [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ]);
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

test("cli can export a Claude session as a Codex resume file", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("codex-export");
  const exportPath = path.join(outDir, "codex-session.jsonl");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--agent", "claude", "--session", sessionPath, "--export", "codex-session", "--out", exportPath],
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

  const exported = await fs.readFile(exportPath, "utf8");

  assert.equal(result.code, 0);
  assert.match(result.stdout, /codex-session\.jsonl/);
  assert.doesNotMatch(result.stdout, /codex resume claude-session/);
  assert.equal(result.stderr, "");
  assert.match(exported, /"type":"session_meta"/);
  assert.match(exported, /"type":"response_item"/);
  assert.match(exported, /"role":"assistant"/);
});

test("cli installs default codex exports into the real Codex session directory", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("codex-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "claude", "codex", "--session", sessionPath, "--export", "codex-session", "--json"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, HOME: fakeHome },
      },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "codex-session");
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".codex", "sessions", "2026", "03", "20", payload.fileName),
  );
  assert.equal(payload.resumeCommand, "codex resume claude-session");
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
});

test("cli installs default claude exports into the real Claude session directory", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const fakeHome = await makeTempDir("claude-home");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "codex", "claude", "--session", sessionPath, "--export", "claude-session", "--json"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, HOME: fakeHome },
      },
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "claude-session");
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".claude", "projects", "-tmp-demo", "sample-session.jsonl"),
  );
  assert.equal(payload.resumeCommand, "claude --resume sample-session");
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
});

test("cli can resolve a session by session id", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--agent", "codex", "--session-id", "later", "--root", sessionsRoot, "--stdout"],
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
  assert.match(result.stdout, /Session ID: later/);
  assert.equal(result.stderr, "");
});

test("cli can emit machine-readable json for handoff file output", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("json-out");
  const handoffPath = path.join(outDir, "handoff.md");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--out", handoffPath, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "handoff");
  assert.equal(payload.sourceAgent, "codex");
  assert.equal(payload.targetAgent, "cursor");
  assert.equal(payload.sessionId, "sample-session");
  assert.equal(payload.outputPath, handoffPath);
  assert.equal(payload.promptPath, path.join(outDir, "handoff.start.txt"));
});

test("cli writes default handoff output under ./tmp/agent-session-bridge", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const workDir = await makeTempDir("default-handoff-cwd");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--json"],
      { cwd: workDir, stdio: ["ignore", "pipe", "pipe"] },
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

  const payload = JSON.parse(result.stdout);
  const expectedOutputPath = await fs.realpath(
    path.join(workDir, "tmp", "agent-session-bridge", "agent-handoff-sample-codex-session.md"),
  );
  const expectedPromptPath = await fs.realpath(
    path.join(workDir, "tmp", "agent-session-bridge", "agent-handoff-sample-codex-session.start.txt"),
  );
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(await fs.realpath(payload.outputPath), expectedOutputPath);
  assert.equal(await fs.realpath(payload.promptPath), expectedPromptPath);
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
  assert.equal(await fs.readFile(payload.promptPath, "utf8").then(Boolean), true);
});

test("cli can emit machine-readable json for stdout output", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--stdout", "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "handoff");
  assert.equal(payload.output, "stdout");
  assert.equal(payload.sessionId, "sample-session");
  assert.equal(payload.sessionPath, sessionPath);
});

test("cli can emit machine-readable json for codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("json-export");
  const exportPath = path.join(outDir, "codex-session.jsonl");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c2x", "--session", sessionPath, "--export", "codex-session", "--out", exportPath, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.outputPath, exportPath);
  assert.equal(payload.resumeCommand, undefined);
  assert.equal(payload.sourceAgent, "claude");
  assert.equal(payload.targetAgent, "codex");
  assert.match(payload.fileName, /^rollout-/);
});

test("cli can emit machine-readable json for claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("json-claude-export");
  const exportPath = path.join(outDir, "sample-session.jsonl");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2c", "--session", sessionPath, "--export", "claude-session", "--out", exportPath, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.mode, "claude-session");
  assert.equal(payload.outputPath, exportPath);
  assert.equal(payload.resumeCommand, undefined);
  assert.equal(payload.sourceAgent, "codex");
  assert.equal(payload.targetAgent, "claude");
  assert.equal(payload.fileName, "sample-session.jsonl");
});

test("cli can write handoff files into an explicit output directory", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("output-dir-handoff");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--output-dir", outDir, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(path.dirname(payload.outputPath), outDir);
  assert.equal(path.dirname(payload.promptPath), outDir);
});

test("cli auto-creates a missing output directory", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const baseDir = await makeTempDir("missing-output-dir");
  const outDir = path.join(baseDir, "nested", "bridge-out");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "x2r", "--session", sessionPath, "--output-dir", outDir, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(path.dirname(payload.outputPath), outDir);
  assert.equal(path.dirname(payload.promptPath), outDir);
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
  assert.equal(await fs.readFile(payload.promptPath, "utf8").then(Boolean), true);
});

test("cli can write codex exports into an explicit output directory", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("output-dir-export");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c2x", "--session", sessionPath, "--export", "codex-session", "--output-dir", outDir, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(path.dirname(payload.outputPath), outDir);
});

test("cli auto-creates parent directories for --out codex exports", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const baseDir = await makeTempDir("missing-out-parent");
  const exportPath = path.join(baseDir, "nested", "exports", "codex-session.jsonl");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c2x", "--session", sessionPath, "--export", "codex-session", "--out", exportPath, "--json"],
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

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.outputPath, exportPath);
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
});

test("cli can split a session into a smaller handoff bundle", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("split-out");
  const handoffPath = path.join(outDir, "split.md");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--agent", "claude", "--session", sessionPath, "--split-recent", "1", "--out", handoffPath],
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

  const handoff = await fs.readFile(handoffPath, "utf8");
  const prompt = await fs.readFile(path.join(outDir, "split.start.txt"), "utf8");

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /split\.md/);
  assert.match(handoff, /帮我总结当前目录/);
  assert.doesNotMatch(handoff, /你好！有什么我可以帮你的吗？/);
  assert.doesNotMatch(handoff, /\[Request interrupted by user\]/);
  assert.match(prompt, /\.\/split\.md/);
});

test("cli can fork a session by appending a new idea", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("fork-out");
  const handoffPath = path.join(outDir, "fork.md");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cliPath,
        "--agent",
        "codex",
        "--session",
        sessionPath,
        "--fork",
        "另外开一个分支，去做 session split",
        "--out",
        handoffPath,
      ],
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

  const handoff = await fs.readFile(handoffPath, "utf8");

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(handoff, /另外开一个分支，去做 session split/);
  assert.match(handoff, /Start by checking the latest user request: "另外开一个分支，去做 session split"/);
});

test("cli can fork a session from a prompt file", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("fork-file-out");
  const handoffPath = path.join(outDir, "fork-file.md");
  const forkPromptPath = path.join(outDir, "fork.txt");
  await fs.writeFile(forkPromptPath, "把这个问题拆出去，单独研究 skill 的接口\n", "utf8");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cliPath,
        "--agent",
        "codex",
        "--session",
        sessionPath,
        "--fork-file",
        forkPromptPath,
        "--out",
        handoffPath,
      ],
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

  const handoff = await fs.readFile(handoffPath, "utf8");

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(handoff, /单独研究 skill 的接口/);
});

test("cli fails clearly when both --fork and --fork-file are provided", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const outDir = await makeTempDir("fork-conflict-out");
  const forkPromptPath = path.join(outDir, "fork.txt");
  await fs.writeFile(forkPromptPath, "fork from file\n", "utf8");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cliPath,
        "--agent",
        "codex",
        "--session",
        sessionPath,
        "--fork",
        "fork from arg",
        "--fork-file",
        forkPromptPath,
        "--stdout",
      ],
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

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Use either --fork or --fork-file, not both/);
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
