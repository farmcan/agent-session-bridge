import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

import { chooseClaudeSessionPath, chooseSessionPath } from "../src/cli.js";
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
  splitSession,
  supportedAgents,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

function spawnCli(args, options = {}) {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
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
}

test("supportedAgents exposes the native-export adapter set", () => {
  assert.deepEqual(supportedAgents.sort(), ["claude", "codex", "qoder", "qodercli"].sort());
});

test("detectAgent recognizes Codex, Claude, Qoder, and QoderCLI alias paths", () => {
  assert.equal(detectAgent("/tmp/.codex/sessions/2026/03/demo.jsonl"), "codex");
  assert.equal(detectAgent("/tmp/.claude/projects/foo.jsonl"), "claude");
  assert.equal(detectAgent("/tmp/.qoder/projects/demo.jsonl"), "qoder");
  assert.equal(detectAgent("/tmp/.qoder/bin/qodercli/demo.jsonl"), "qodercli");
  assert.equal(detectAgent("/tmp/.cursor/projects/foo/agent-transcripts/id/session.jsonl"), null);
});

test("inferDefaultExportFormat prefers native exports for supported aliases", () => {
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2c", exportFormat: null }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2c", exportFormat: null }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2q", exportFormat: null }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2q", exportFormat: null }).exportFormat, "qoder-session");
});

test("getExportCapability exposes qoder export pairs", () => {
  assert.equal(getExportCapability("qodercli", "codex")?.format, "codex-session");
  assert.equal(getExportCapability("qodercli", "claude")?.format, "claude-session");
  assert.equal(getExportCapability("codex", "qodercli")?.format, "qoder-session");
  assert.equal(getExportCapability("claude", "qodercli")?.format, "qoder-session");
});

test("parseSession reads Codex sessions", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    agent: "codex",
  });

  assert.equal(session.agent, "codex");
  assert.equal(session.sessionId, "sample-session");
  assert.equal(session.cwd, "/tmp/demo");
  assert.equal(session.messages.length, 2);
});

test("parseSession filters Codex developer, system, and bootstrap messages", async () => {
  const tempDir = await makeTempDir("codex-filter");
  const sessionPath = path.join(tempDir, "rollout-demo.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"demo","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"developer note"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"system","content":[{"type":"input_text","text":"system note"}]}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /tmp/demo"}]}}',
      '{"timestamp":"2026-03-20T10:00:04.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"real user request"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });
  assert.deepEqual(session.messages, [{ role: "user", text: "real user request" }]);
});

test("parseSession reads Qoder sessions and drops meta rows", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    agent: "qoder",
  });

  assert.equal(session.agent, "qoder");
  assert.equal(session.sessionId, "qoder-session");
  assert.equal(session.title, "Demo Qoder Session");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].text, "你好");
});

test("parseSession reads Claude sessions", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  assert.equal(session.agent, "claude");
  assert.equal(session.sessionId, "claude-session");
  assert.equal(session.cwd, "/workspace/claude-demo");
  assert.equal(session.messages.length, 3);
});

test("renderCodexResumeExport converts a Claude transcript", async () => {
  const exported = await renderCodexResumeExport({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.match(exported.fileName, /^rollout-/);
  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "session_meta");
  assert.equal(lines[1].type, "response_item");
});

test("renderClaudeResumeExport converts a Codex transcript", async () => {
  const exported = await renderClaudeResumeExport({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    agent: "codex",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.equal(exported.fileName, "11111111-2222-4333-8444-555555555555.jsonl");
  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "file-history-snapshot");
  assert.equal(lines[1].type, "user");
});

test("exportSession renders qodercli -> codex", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    sourceAgent: "qodercli",
    targetAgent: "codex",
    format: "codex-session",
  });

  assert.equal(exported.mode, "codex-session");
  assert.equal(exported.sessionId, "qoder-session");
  assert.match(exported.files[0].content, /"type":"session_meta"/);
});

test("exportSession renders qodercli -> claude", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    sourceAgent: "qodercli",
    targetAgent: "claude",
    format: "claude-session",
  });

  assert.equal(exported.mode, "claude-session");
  assert.match(exported.files[0].content, /"type":"user"/);
});

test("exportSession renders codex -> qodercli", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    sourceAgent: "codex",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.files.length, 2);
  assert.match(exported.files[1].fileName, /-session\.json$/);
});

test("exportSession renders claude -> qodercli", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    sourceAgent: "claude",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.files.length, 2);
});

test("splitSession keeps only the most recent user turn and following messages", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  const split = splitSession(session, { recentUserTurns: 1 });
  assert.equal(split.messages[0].role, "user");
  assert.match(split.messages[0].text, /帮我总结当前目录/);
});

test("forkSession appends a user message", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  const forked = forkSession(session, { prompt: "另外开一个分支，去做 session split" });
  assert.equal(forked.messages.at(-1)?.text, "另外开一个分支，去做 session split");
});

test("findLatestSession prefers Codex cwd matches", async () => {
  const currentDir = await makeTempDir("codex-workspace-a");
  const otherDir = await makeTempDir("codex-workspace-b");
  const sessionsRoot = await makeTempDir("codex-sessions");
  await fs.mkdir(path.join(sessionsRoot, "2026", "03"), { recursive: true });
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "aaa.jsonl"),
    `{"timestamp":"2026-03-19T10:00:00.000Z","type":"session_meta","payload":{"id":"workspace-b","cwd":"${otherDir}"}}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "bbb.jsonl"),
    `{"timestamp":"2026-03-19T11:00:00.000Z","type":"session_meta","payload":{"id":"workspace-a","cwd":"${currentDir}"}}\n`,
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "codex" });
  assert.equal(path.basename(latest), "bbb.jsonl");
});

test("findMatchingSessions returns Claude cwd matches", async () => {
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
  assert.deepEqual(matches.map((filePath) => path.basename(filePath)), ["aaa.jsonl", "bbb.jsonl"]);
});

test("findMatchingSessions skips unreadable Claude jsonl rows and keeps scanning", async () => {
  const currentDir = await makeTempDir("claude-corrupt-match-workspace");
  const sessionsRoot = await makeTempDir("claude-corrupt-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "broken.jsonl"),
    `${String.fromCharCode(0, 0, 0)}{"type":"user","message":{"role":"user","content":"broken"},"timestamp":"2026-03-20T10:30:00.000Z","cwd":"${currentDir}","sessionId":"broken"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );

  const matches = await findMatchingSessions(sessionsRoot, { cwd: currentDir, agent: "claude" });
  assert.deepEqual(matches.map((filePath) => path.basename(filePath)), ["aaa.jsonl", "bbb.jsonl"]);
});

test("findSessionById finds a Codex session by id", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const found = await findSessionById(sessionsRoot, { agent: "codex", sessionId: "later" });
  assert.match(found, /later/);
});

test("chooseSessionPath fails clearly in non-interactive mode", async () => {
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

test("chooseSessionPath keeps full session titles in non-interactive errors", async () => {
  const longTitle = [
    "需要完整显示的超长 session 标题",
    "用于区分两个非常相似",
    "但关键结尾不同的候选记录",
    "并且不能被截断",
    "A",
  ].join(" ");

  await assert.rejects(
    chooseSessionPath(
      "Codex",
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title: longTitle,
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: `${longTitle} B`,
        },
      ],
      { isInteractive: false },
    ),
    (error) => {
      assert.match(error.message, new RegExp(longTitle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      assert.match(
        error.message,
        /需要完整显示的超长 session 标题 用于区分两个非常相似 但关键结尾不同的候选记录 并且不能被截断 A B/u,
      );
      assert.doesNotMatch(error.message, /\.\.\./);
      return true;
    },
  );
});

test("chooseSessionPath returns interactive selection", async () => {
  const writes = [];
  const selected = await chooseSessionPath(
    "Codex",
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
  assert.match(writes.join(""), /Multiple Codex sessions match the current directory/);
});

test("cli --help only documents native export commands", async () => {
  const result = await spawnCli(["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /kage <source> <target> \[options\]/);
  assert.match(result.stdout, /agent-session-bridge <source> <target> \[options\]/);
  assert.doesNotMatch(result.stdout, /--handoff/);
  assert.doesNotMatch(result.stdout, /--copy/);
  assert.doesNotMatch(result.stdout, /x2r/);
});

test("package.json exposes kage and legacy agent-session-bridge bins", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(packageJson.bin.kage, "./src/cli.js");
  assert.equal(packageJson.bin["agent-session-bridge"], "./src/cli.js");
});

test("cli fails clearly for removed handoff flags and cursor aliases", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");

  const removedFlagResult = await spawnCli(["x2c", "--session", sessionPath, "--handoff"]);
  assert.equal(removedFlagResult.code, 1);
  assert.match(removedFlagResult.stderr, /Unsupported option: --handoff/);

  const removedAliasResult = await spawnCli(["x2r", "--session", sessionPath]);
  assert.equal(removedAliasResult.code, 1);
  assert.match(removedAliasResult.stderr, /Unsupported route alias: x2r/);
});

test("cli supports shorthand positional source and target agents", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const result = await spawnCli(["c", "x", "--session", sessionPath, "--stdout"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /"type":"session_meta"/);
});

test("cli supports x2c as a Claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const fakeHome = await makeTempDir("x2c-home");
  const result = await spawnCli(["x2c", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "claude-session");
  assert.equal(payload.resumeCommand, "claude --resume sample-session");
});

test("cli supports c2x as a Codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const fakeHome = await makeTempDir("c2x-home");
  const result = await spawnCli(["c2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.resumeCommand, "codex resume claude-session");
});

test("cli supports x2x as a Codex fork export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const fakeHome = await makeTempDir("x2x-home");
  const result = await spawnCli(["x2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "codex-session");
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(payload.sessionId, "sample-session");
});

test("cli supports q2x and q2c", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const fakeHome = await makeTempDir("qoder-home");

  const q2x = await spawnCli(["q2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const q2c = await spawnCli(["q2c", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  assert.equal(JSON.parse(q2x.stdout).mode, "codex-session");
  assert.equal(JSON.parse(q2c.stdout).mode, "claude-session");
});

test("cli supports x2q and c2q", async () => {
  const codexSessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const claudeSessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");

  const x2q = await spawnCli(["x2q", "--session", codexSessionPath, "--json"]);
  const c2q = await spawnCli(["c2q", "--session", claudeSessionPath, "--json"]);

  assert.equal(JSON.parse(x2q.stdout).mode, "qoder-session");
  assert.equal(JSON.parse(c2q.stdout).mode, "qoder-session");
});

test("cli runs correctly when invoked through a symlinked entrypoint", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const realCliPath = path.join(__dirname, "..", "src", "cli.js");
  const tempDir = await makeTempDir("cli-symlink");
  const symlinkPath = path.join(tempDir, "agent-session-bridge");
  await fs.symlink(realCliPath, symlinkPath);

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [symlinkPath, "claude", "codex", "--session", sessionPath], {
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
  assert.match(result.stdout, /codex resume claude-session/);
});

test("cli fails clearly for ambiguous Claude sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("claude-cli-match-workspace");
  const sessionsRoot = await makeTempDir("claude-cli-projects");
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

  const result = await spawnCli(["claude", "codex", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Multiple Claude sessions match the current directory/);
});

test("cli fails clearly for ambiguous Codex sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("codex-cli-match-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "21");
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

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Multiple Codex sessions match the current directory/);
});

test("cli shows the first real user prompt instead of Codex environment context in session choices", async () => {
  const currentDir = await makeTempDir("codex-cli-title-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-title-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "22");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T10-00-00-aaa.jsonl"),
    [
      `{"timestamp":"2026-03-22T10:00:00.000Z","type":"session_meta","payload":{"id":"aaa","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>/tmp/demo</cwd>\\n</environment_context>"}]}}',
      '{"timestamp":"2026-03-22T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"总结一下你的上下文"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T11-00-00-bbb.jsonl"),
    [
      `{"timestamp":"2026-03-22T11:00:00.000Z","type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>/tmp/demo</cwd>\\n</environment_context>"}]}}',
      '{"timestamp":"2026-03-22T11:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<turn_aborted>"}]}}',
      '{"timestamp":"2026-03-22T11:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一下 Claude export"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /总结一下你的上下文/);
  assert.match(result.stderr, /做一下 Claude export/);
  assert.doesNotMatch(result.stderr, /<environment_context>/);
  assert.doesNotMatch(result.stderr, /<turn_aborted>/);
});

test("cli installs default Codex exports into the real Codex session directory", async () => {
  const fakeHome = await makeTempDir("codex-home");
  const result = await spawnCli(
    ["claude", "codex", "--session", path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"), "--json"],
    { env: { ...process.env, HOME: fakeHome } },
  );

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".codex", "sessions", "2026", "03", "20", payload.fileName),
  );
});

test("cli installs default Claude exports into the real Claude session directory", async () => {
  const fakeHome = await makeTempDir("claude-home");
  const result = await spawnCli(
    ["codex", "claude", "--session", path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"), "--json"],
    { env: { ...process.env, HOME: fakeHome } },
  );

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".claude", "projects", "-tmp-demo", "sample-session.jsonl"),
  );
});

test("cli can emit machine-readable json for codex and claude session exports", async () => {
  const codexOutDir = await makeTempDir("json-codex-export");
  const claudeOutDir = await makeTempDir("json-claude-export");
  const codexPath = path.join(codexOutDir, "codex-session.jsonl");
  const claudePath = path.join(claudeOutDir, "sample-session.jsonl");

  const codexResult = await spawnCli([
    "c2x",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--out",
    codexPath,
    "--json",
  ]);
  const claudeResult = await spawnCli([
    "x2c",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    "--out",
    claudePath,
    "--json",
  ]);

  assert.equal(JSON.parse(codexResult.stdout).outputPath, codexPath);
  assert.equal(JSON.parse(claudeResult.stdout).outputPath, claudePath);
});

test("cli can emit machine-readable json for qoder session exports", async () => {
  const outDir = await makeTempDir("json-qoder-export");
  const exportPath = path.join(outDir, "sample-session.jsonl");

  const result = await spawnCli([
    "x2q",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    "--out",
    exportPath,
    "--json",
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "qoder-session");
  assert.equal(payload.outputPath, exportPath);
  assert.match(payload.sidecarPath, /-session\.json$/);
});

test("cli auto-creates missing output directories for exports", async () => {
  const baseDir = await makeTempDir("missing-output-dir");
  const outDir = path.join(baseDir, "nested", "exports");

  const result = await spawnCli([
    "c2x",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--output-dir",
    outDir,
    "--json",
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(path.dirname(payload.outputPath), outDir);
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
});

test("cli can resolve a session by session id", async () => {
  const result = await spawnCli([
    "--agent",
    "codex",
    "--target",
    "claude",
    "--session-id",
    "later",
    "--root",
    path.join(__dirname, "..", "fixtures", "sessions"),
    "--json",
  ]);

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sessionId, "later");
  assert.equal(payload.mode, "claude-session");
});

test("cli can split a session before export", async () => {
  const outDir = await makeTempDir("split-export");
  const exportPath = path.join(outDir, "split.jsonl");
  const result = await spawnCli([
    "claude",
    "qoder",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--split-recent",
    "1",
    "--out",
    exportPath,
    "--json",
  ]);

  const content = await fs.readFile(exportPath, "utf8");
  assert.equal(result.code, 0);
  assert.match(content, /帮我总结当前目录/);
  assert.doesNotMatch(content, /你好！有什么我可以帮你的吗？/);
});

test("cli can fork a session before export", async () => {
  const outDir = await makeTempDir("fork-export");
  const exportPath = path.join(outDir, "fork.jsonl");
  const result = await spawnCli([
    "claude",
    "qoder",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--fork",
    "另外开一个分支，去做 session split",
    "--out",
    exportPath,
    "--json",
  ]);

  const content = await fs.readFile(exportPath, "utf8");
  assert.equal(result.code, 0);
  assert.match(content, /另外开一个分支，去做 session split/);
});

test("cli fails clearly when both --fork and --fork-file are provided", async () => {
  const promptFile = path.join(await makeTempDir("fork-file"), "fork.txt");
  await fs.writeFile(promptFile, "fork me", "utf8");

  const result = await spawnCli([
    "claude",
    "qoder",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--fork",
    "fork me",
    "--fork-file",
    promptFile,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use either --fork or --fork-file/);
});
