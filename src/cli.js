#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSession } from "./adapters/sources/index.js";
import { formatAgentName, getDefaultRoot, supportedAgents } from "./core/agents.js";
import { findMatchingSessions, findSessionById, findLatestSession } from "./core/discovery.js";
import { exportSession } from "./core/exporting.js";
import { resolveInstallPlan } from "./core/install.js";
import { inferDefaultExportFormat, routeAliases } from "./core/routing.js";

const shorthandAgents = ["c", "x", "q"];
const supportedRouteAliasList = Object.keys(routeAliases).join(", ");
const removedRouteAliases = new Set(["x2r", "c2r", "q2r", "r2x", "r2c", "r2q"]);
const removedOptions = new Set(["--handoff", "--copy", "--cursor"]);

const helpText = `Usage:
  kage update
  kage <agent>
  kage <source> <target> [options]
  kage <route-alias> [options]
  agent-session-bridge <source> <target> [options]
  agent-session-bridge <route-alias> [options]

Route aliases:
  x2x   codex -> codex
  x2c   codex -> claude
  x2q   codex -> qoder
  x2v   codex -> visualize
  c2c   claude -> claude
  c2x   claude -> codex
  c2q   claude -> qoder
  c2v   claude -> visualize
  q2q   qoder -> qoder
  q2x   qoder -> codex
  q2c   qoder -> claude
  q2v   qoder -> visualize

Agent shorthands:
  x     codex
  c     claude
  q     qoder

Options:
  --agent <agent>
  --target <agent>
  --session <path>
  --session-id <id>
  --out <path>
  --output-dir <dir>
  --export codex-session|claude-session|qoder-session|session-story-html
  --split-recent <n>
  --fork <prompt>
  --fork-file <path>
  --stdout
  --json
  --help`;

function applyPreset(args, preset) {
  return {
    ...args,
    agent: args.agent ?? preset.agent,
    target: args.target ?? preset.target,
  };
}

function parseArgs(argv) {
  const args = {
    update: false,
    listAgent: null,
    agent: null,
    root: null,
    session: null,
    sessionId: null,
    out: null,
    outputDir: null,
    target: null,
    routeAlias: null,
    exportFormat: null,
    splitRecent: null,
    forkPrompt: null,
    forkFile: null,
    json: false,
    stdout: false,
    help: false,
    error: null,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (removedOptions.has(arg)) {
      args.error = `Unsupported option: ${arg}`;
    } else if (arg === "--agent") {
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
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }

  const [first, second] = positional;
  if (first === "update" && !second) {
    return { ...args, update: true };
  }
  if (first && !second && (supportedAgents.includes(first) || shorthandAgents.includes(first))) {
    return { ...args, listAgent: first };
  }
  if (first && removedRouteAliases.has(first)) {
    return { ...args, error: `Unsupported route alias: ${first}` };
  }
  if (first && routeAliases[first]) {
    return inferDefaultExportFormat({
      ...applyPreset(args, routeAliases[first]),
      routeAlias: first,
    });
  }
  if (first && !second && /^[a-z]2[a-z]$/u.test(first)) {
    return {
      ...args,
      error: `Unknown route alias: ${first}. Supported aliases: ${supportedRouteAliasList}\nRun: kage update`,
    };
  }
  if (
    first &&
    second &&
    (supportedAgents.includes(first) || shorthandAgents.includes(first)) &&
    (supportedAgents.includes(second) || shorthandAgents.includes(second))
  ) {
    return inferDefaultExportFormat(applyPreset(args, { agent: first, target: second }));
  }

  return inferDefaultExportFormat(args);
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

export async function runUpdateCommand({
  command = process.env.KAGE_UPDATE_COMMAND ?? "curl -fsSL https://raw.githubusercontent.com/farmcan/agent-session-bridge/main/install.sh | bash",
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const shell = process.env.SHELL || "sh";
  await new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Update failed with exit code ${code}`));
    });
  });
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

function formatSessionTitle(title, maxLength = Number.POSITIVE_INFINITY) {
  const normalized = String(title ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) {
    return "(untitled)";
  }
  if (!Number.isFinite(maxLength) || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function isIgnorableSessionTitleMessage(text) {
  const normalized = String(text ?? "").trimStart();
  return normalized.startsWith("<environment_context>") || normalized.startsWith("<turn_aborted>");
}

function getRealUserMessages(session) {
  return session.messages.filter(
    (message) => message.role === "user" && message.text.trim() && !isIgnorableSessionTitleMessage(message.text),
  );
}

function getSessionTitle(session) {
  if (session.title) {
    return formatSessionTitle(session.title);
  }
  const firstUserMessage = getRealUserMessages(session)[0];
  return formatSessionTitle(firstUserMessage?.text);
}

function formatSessionCandidate(candidate, index) {
  const title = formatSessionTitle(candidate.title);
  const updatedAt = candidate.updatedAt ?? "unknown time";
  const recentMessages = Array.isArray(candidate.recentUserMessages) ? candidate.recentUserMessages : [];
  const recentSection =
    recentMessages.length > 0
      ? `\n    Recent user messages:\n${recentMessages.map((message) => `    - ${message}`).join("\n")}`
      : "";
  return [
    `[${index + 1}] ${title}`,
    `    Updated: ${updatedAt}`,
    `    Session: ${candidate.sessionId}`,
    `    Path: ${candidate.sessionPath}${recentSection}`,
  ].join("\n");
}

function formatSessionCandidates(candidates) {
  return candidates.map(formatSessionCandidate).join("\n\n\n");
}

function emitSelectedSession(output, candidate) {
  output.write(`${formatSessionCandidate(candidate, 0)}\n`);
  output.write(`Selected: ${candidate.sessionId}\n`);
}

export async function chooseSessionPath(
  agentLabel,
  candidates,
  {
    isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    output = process.stderr,
    prompt = null,
  } = {},
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`No ${agentLabel} session candidates available`);
  }

  if (candidates.length === 1) {
    emitSelectedSession(output, candidates[0]);
    return candidates[0].sessionPath;
  }

  if (!isInteractive) {
    const options = formatSessionCandidates(candidates);
    throw new Error(
      `Multiple ${agentLabel} sessions match the current directory.\n${options}\nUse --session-id to choose one explicitly.`,
    );
  }

  output.write(`Multiple ${agentLabel} sessions match the current directory:\n`);
  output.write(`\n${formatSessionCandidates(candidates)}\n`);

  const ask = prompt ?? (async () => {
    output.write(`Select a session [1-${candidates.length}]: `);
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
      if (String(chunk).includes("\n")) {
        break;
      }
    }
    return chunks.join("").trim();
  });

  while (true) {
    const answer = String(await ask()).trim();
    const selectedIndex = Number(answer);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= candidates.length) {
      return candidates[selectedIndex - 1].sessionPath;
    }
    output.write(`Invalid selection. Choose a number between 1 and ${candidates.length}.\n`);
  }
}

export async function chooseClaudeSessionPath(candidates, options = {}) {
  return chooseSessionPath("Claude", candidates, options);
}

function formatSessionLabel(agent) {
  const value = formatAgentName(agent);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function buildSessionCandidates(args) {
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  const resolvedAgent = formatAgentName(args.agent ?? "codex");
  const matches = await findMatchingSessions(rootDir, {
    cwd: process.cwd(),
    agent: resolvedAgent,
  });
  return Promise.all(
    matches
      .sort()
      .reverse()
      .map(async (sessionPath) => {
        const session = await parseSession({ sessionPath, agent: resolvedAgent });
        return {
          sessionPath,
          sessionId: session.sessionId,
          updatedAt: session.updatedAt,
          title: getSessionTitle(session),
          recentUserMessages: getRealUserMessages(session)
            .slice(-3)
            .reverse()
            .map((message) => formatSessionTitle(message.text)),
        };
      }),
  );
}

async function resolveSessionPath(args) {
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  if (args.session) {
    return args.session;
  }
  if (args.sessionId) {
    return findSessionById(rootDir, {
      sessionId: args.sessionId,
      agent: args.agent ?? "codex",
    });
  }

  const candidates = await buildSessionCandidates(args);
  if (candidates.length > 0) {
    return chooseSessionPath(formatSessionLabel(args.agent ?? "codex"), candidates);
  }

  return findLatestSession(rootDir, {
    cwd: process.cwd(),
    agent: args.agent ?? "codex",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${helpText}\n`);
    return;
  }
  if (args.update) {
    await runUpdateCommand();
    return;
  }
  if (args.listAgent) {
    const resolvedAgent = formatAgentName(args.listAgent);
    const candidates = await buildSessionCandidates({ ...args, agent: resolvedAgent });
    if (candidates.length === 0) {
      throw new Error(`No ${formatSessionLabel(resolvedAgent)} sessions match the current directory`);
    }
    process.stdout.write(`Matching ${formatSessionLabel(resolvedAgent)} sessions for ${process.cwd()}:\n\n`);
    process.stdout.write(`${formatSessionCandidates(candidates)}\n`);
    return;
  }
  if (args.error) {
    throw new Error(args.error);
  }
  if (!args.agent || !args.target || !args.exportFormat) {
    throw new Error("Provide a supported source/target pair or route alias");
  }

  args.forkPrompt = await resolveForkPrompt(args);
  const sessionPath = await resolveSessionPath(args);
  const exported = await exportSession({
    sessionPath,
    sourceAgent: args.agent,
    targetAgent: args.target,
    format: args.exportFormat,
    splitRecent: args.splitRecent,
    forkPrompt: args.forkPrompt,
  });

  if (args.stdout) {
    if (args.json) {
      emitResult(
        {
          mode: exported.mode,
          output: "stdout",
          sourceAgent: exported.sourceAgent,
          targetAgent: exported.targetAgent,
          sessionId: exported.sessionId,
          sessionPath,
          ...(exported.files[0] ? { fileName: exported.files[0].fileName } : {}),
        },
        true,
      );
      return;
    }
    process.stdout.write(exported.files[0]?.content ?? "");
    return;
  }

  const installPlan = resolveInstallPlan({
    args,
    exported,
    targetAgent: args.target,
  });

  for (const file of installPlan.files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, "utf8");
  }

  const mainFile = installPlan.files.find((file) => file.key === "main") ?? installPlan.files[0];
  const sidecarFile = installPlan.files.find((file) => file.key === "sidecar");
  emitResult(
    {
      mode: exported.mode,
      sourceAgent: exported.sourceAgent,
      targetAgent: exported.targetAgent,
      sessionId: exported.sessionId,
      sessionPath,
      ...(mainFile ? { fileName: mainFile.fileName } : {}),
      ...(mainFile ? { outputPath: mainFile.path } : {}),
      ...(sidecarFile ? { sidecarPath: sidecarFile.path } : {}),
      ...(installPlan.resumeCommand ? { resumeCommand: installPlan.resumeCommand } : {}),
      paths: installPlan.files.map((file) => file.path),
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
