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
  findSessionById,
  forkSession,
  parseSession,
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
  assert.match(result.stdout, /Source Agent: c/);
  assert.match(result.stdout, /Target Agent: x/);
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
  assert.match(result.stdout, /Source Agent: x/);
  assert.match(result.stdout, /Target Agent: r/);
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
  assert.match(result.stdout, /Source Agent: x/);
  assert.match(result.stdout, /Target Agent: r/);
  assert.equal(result.stderr, "");
});

test("cli supports built-in route aliases like c2x", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const cliPath = path.join(__dirname, "..", "src", "cli.js");

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "c2x", "--session", sessionPath, "--stdout"],
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
  assert.match(result.stdout, /Source Agent: c/);
  assert.match(result.stdout, /Target Agent: x/);
  assert.equal(result.stderr, "");
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
  assert.match(result.stdout, /Source Agent: c/);
  assert.match(result.stdout, /Target Agent: r/);
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
  assert.equal(result.stderr, "");
  assert.match(exported, /"type":"session_meta"/);
  assert.match(exported, /"type":"response_item"/);
  assert.match(exported, /"role":"assistant"/);
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
  assert.equal(payload.sourceAgent, "x");
  assert.equal(payload.targetAgent, "r");
  assert.equal(payload.sessionId, "sample-session");
  assert.equal(payload.outputPath, handoffPath);
  assert.equal(payload.promptPath, path.join(outDir, "handoff.start.txt"));
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
  assert.match(payload.content, /# Agent Session Handoff/);
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
  assert.equal(payload.sourceAgent, "c");
  assert.equal(payload.targetAgent, "x");
  assert.match(payload.fileName, /^rollout-/);
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
