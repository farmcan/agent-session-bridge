#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  formatAgentName,
  findSessionById,
  findLatestSession,
  forkSession,
  getDefaultRoot,
  supportedAgents,
  renderCodexResumeExport,
  renderHandoff,
  renderStartPrompt,
  parseSession,
  splitSession,
} from "./index.js";

const routeAliases = {
  x2c: { agent: "x", target: "c" },
  x2q: { agent: "x", target: "q" },
  x2r: { agent: "x", target: "r" },
  c2x: { agent: "c", target: "x" },
  c2q: { agent: "c", target: "q" },
  c2r: { agent: "c", target: "r" },
  q2x: { agent: "q", target: "x" },
  q2c: { agent: "q", target: "c" },
  q2r: { agent: "q", target: "r" },
  r2x: { agent: "r", target: "x" },
  r2c: { agent: "r", target: "c" },
  r2q: { agent: "r", target: "q" },
};

const shorthandAgents = ["c", "x", "q", "r"];

const helpText = `Usage:
  agent-session-bridge <source> <target> [options]
  agent-session-bridge <route-alias> [options]
  agent-session-bridge [options]

Route aliases:
  x2c   codex -> claude
  x2q   codex -> qoder
  x2r   codex -> cursor
  c2x   claude -> codex
  c2q   claude -> qoder
  c2r   claude -> cursor
  q2x   qoder -> codex
  q2c   qoder -> claude
  q2r   qoder -> cursor
  r2x   cursor -> codex
  r2c   cursor -> claude
  r2q   cursor -> qoder

Agent shorthands:
  x     codex
  c     claude
  q     qoder
  r     cursor

Options:
  --agent <agent>
  --target <agent>
  --session <path>
  --session-id <id>
  --out <path>
  --output-dir <dir>
  --export codex-session
  --split-recent <n>
  --fork <prompt>
  --fork-file <path>
  --stdout
  --copy
  --json
  --help`;

function applyPreset(args, preset) {
  return {
    ...args,
    agent: args.agent ?? preset.agent,
    target: args.target === "cursor" && !args.agent ? preset.target : args.target,
  };
}

function parseArgs(argv) {
  const args = {
    agent: null,
    root: null,
    session: null,
    sessionId: null,
    out: null,
    outputDir: null,
    target: "cursor",
    exportFormat: null,
    splitRecent: null,
    forkPrompt: null,
    forkFile: null,
    json: false,
    stdout: false,
    cursor: false,
    copy: false,
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--agent") {
      args.agent = argv[i + 1];
      i += 1;
    } else if (arg === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else if (arg === "--session") {
      args.session = argv[i + 1];
      i += 1;
    } else if (arg === "--session-id") {
      args.sessionId = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[i + 1];
      i += 1;
    } else if (arg === "--target") {
      args.target = argv[i + 1];
      i += 1;
    } else if (arg === "--export") {
      args.exportFormat = argv[i + 1];
      i += 1;
    } else if (arg === "--split-recent") {
      args.splitRecent = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--fork") {
      args.forkPrompt = argv[i + 1];
      i += 1;
    } else if (arg === "--fork-file") {
      args.forkFile = argv[i + 1];
      i += 1;
    } else if (arg === "--stdout") {
      args.stdout = true;
    } else if (arg === "--cursor") {
      args.cursor = true;
    } else if (arg === "--copy") {
      args.copy = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }

  const [first, second] = positional;
  if (first && routeAliases[first]) {
    return applyPreset(args, routeAliases[first]);
  } else if (
    first &&
    second &&
    (supportedAgents.includes(first) || shorthandAgents.includes(first)) &&
    (supportedAgents.includes(second) || shorthandAgents.includes(second))
  ) {
    return applyPreset(args, { agent: first, target: second });
  }

  return args;
}

function runCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

export function getClipboardCommandCandidates(platform = process.platform) {
  if (platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }
  if (platform === "win32") {
    return [{ command: "clip", args: [] }];
  }
  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

function copyToClipboard(content) {
  return new Promise((resolve, reject) => {
    const candidates = getClipboardCommandCandidates();
    let index = 0;

    function tryNext(lastError = null) {
      const candidate = candidates[index];
      if (!candidate) {
        reject(lastError ?? new Error("No clipboard command available"));
        return;
      }
      index += 1;

      const child = spawn(candidate.command, candidate.args);
      child.stdin.on("error", () => {
        tryNext(new Error(`${candidate.command} failed`));
      });
      child.stdin.write(content);
      child.stdin.end();
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        tryNext(new Error(`${candidate.command} failed`));
      });
      child.on("error", () => {
        tryNext(new Error(`${candidate.command} failed`));
      });
    }

    tryNext();
  });
}

async function resolveForkPrompt(args) {
  if (args.forkPrompt && args.forkFile) {
    throw new Error("Use either --fork or --fork-file, not both");
  }

  if (args.forkFile) {
    const content = await fs.readFile(args.forkFile, "utf8");
    return content.trim();
  }

  return args.forkPrompt;
}

function applySessionTransforms(session, args) {
  let nextSession = session;
  if (args.splitRecent) {
    nextSession = splitSession(nextSession, { recentUserTurns: args.splitRecent });
  }
  if (args.forkPrompt) {
    nextSession = forkSession(nextSession, { prompt: args.forkPrompt });
  }
  return nextSession;
}

function emitResult(payload, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (Array.isArray(payload.paths)) {
    process.stdout.write(`${payload.paths.join("\n")}\n`);
  }

  if (payload.resumeCommand) {
    process.stdout.write(`Run:\n${payload.resumeCommand}\n`);
  }
}

function resolveOutputPath(args, fallbackName) {
  if (args.out) {
    return args.out;
  }
  if (args.outputDir) {
    return path.join(args.outputDir, fallbackName);
  }
  return path.join(process.cwd(), "tmp", "agent-session-bridge", fallbackName);
}

function resolveCodexInstallPath(fileName) {
  const match = fileName.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T/u);
  if (!match) {
    throw new Error(`Unable to derive Codex session install path from file name: ${fileName}`);
  }

  const [, year, month, day] = match;
  return path.join(getDefaultRoot("codex"), year, month, day, fileName);
}

function isInstalledInCodexSessions(outputPath) {
  const codexRoot = getDefaultRoot("codex");
  const relative = path.relative(codexRoot, outputPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${helpText}\n`);
    return;
  }
  args.forkPrompt = await resolveForkPrompt(args);
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  const sessionPath =
    args.session ??
    (args.sessionId
      ? await findSessionById(rootDir, {
          sessionId: args.sessionId,
          agent: args.agent ?? "codex",
        })
      : await findLatestSession(rootDir, {
          cwd: process.cwd(),
          agent: args.agent ?? "codex",
        }));
  const parsedSession = await parseSession({
    sessionPath,
    agent: args.agent,
  });
  const session = applySessionTransforms(parsedSession, args);
  const output = await renderHandoff({
    sessionPath,
    agent: args.agent,
    target: args.target,
    session,
  });

  if (args.exportFormat === "codex-session") {
    const exported = await renderCodexResumeExport({
      sessionPath,
      agent: args.agent,
    });
    const outputPath =
      args.out || args.outputDir ? resolveOutputPath(args, exported.fileName) : resolveCodexInstallPath(exported.fileName);
    const resumeCommand = isInstalledInCodexSessions(outputPath) ? `codex resume ${exported.sessionId}` : null;

    if (args.stdout) {
      if (args.json) {
        emitResult(
          {
            mode: "codex-session",
            output: "stdout",
            sourceAgent: formatAgentName(args.agent ?? parsedSession.agent),
            targetAgent: formatAgentName(args.target),
            sessionId: exported.sessionId,
            sessionPath,
            fileName: exported.fileName,
            ...(resumeCommand ? { resumeCommand } : {}),
          },
          true,
        );
        return;
      }
      process.stdout.write(exported.content);
      return;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, exported.content, "utf8");
    emitResult(
      {
        mode: "codex-session",
        sourceAgent: formatAgentName(args.agent ?? parsedSession.agent),
        targetAgent: formatAgentName(args.target),
        sessionId: exported.sessionId,
        sessionPath,
        fileName: exported.fileName,
        outputPath,
        ...(resumeCommand ? { resumeCommand } : {}),
        paths: [outputPath],
      },
      args.json,
    );
    return;
  }

  if (args.stdout) {
    if (args.json) {
      emitResult(
        {
          mode: "handoff",
          output: "stdout",
          sourceAgent: formatAgentName(args.agent ?? parsedSession.agent),
          targetAgent: formatAgentName(args.target),
          sessionId: session.sessionId,
          sessionPath,
        },
        true,
      );
      return;
    }
    process.stdout.write(output);
    return;
  }

  const outputPath = resolveOutputPath(args, `agent-handoff-${path.basename(sessionPath, ".jsonl")}.md`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output, "utf8");
  const promptPath = outputPath.replace(/\.md$/u, ".start.txt");
  const prompt = await renderStartPrompt({
    handoffPath: `./${path.basename(outputPath)}`,
    target: args.target,
  });
  await fs.writeFile(promptPath, prompt, "utf8");

  if (args.copy) {
    const content = await fs.readFile(promptPath, "utf8");
    await copyToClipboard(content);
  }

  if (args.cursor) {
    await runCommand("cursor", [outputPath, promptPath]);
  }

  emitResult(
    {
      mode: "handoff",
      sourceAgent: formatAgentName(args.agent ?? parsedSession.agent),
      targetAgent: formatAgentName(args.target),
      sessionId: session.sessionId,
      sessionPath,
      outputPath,
      promptPath,
      copied: args.copy,
      openedInCursor: args.cursor,
      paths: [outputPath, promptPath],
    },
    args.json,
  );
}

const invokedCliPath = process.argv[1]
  ? await fs.realpath(process.argv[1]).catch(() => path.resolve(process.argv[1]))
  : null;
const moduleCliPath = await fs.realpath(fileURLToPath(import.meta.url)).catch(() => fileURLToPath(import.meta.url));

if (invokedCliPath && invokedCliPath === moduleCliPath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
