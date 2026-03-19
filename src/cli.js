#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { findLatestSession, getDefaultRoot, renderHandoff } from "./index.js";

function parseArgs(argv) {
  const args = {
    agent: null,
    session: null,
    out: null,
    target: "cursor",
    stdout: false,
    cursor: false,
    copy: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--agent") {
      args.agent = argv[i + 1];
      i += 1;
    } else if (arg === "--session") {
      args.session = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (arg === "--target") {
      args.target = argv[i + 1];
      i += 1;
    } else if (arg === "--stdout") {
      args.stdout = true;
    } else if (arg === "--cursor") {
      args.cursor = true;
    } else if (arg === "--copy") {
      args.copy = true;
    }
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

function copyToClipboard(content) {
  return new Promise((resolve, reject) => {
    const child = spawn("pbcopy");
    child.stdin.write(content);
    child.stdin.end();
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("pbcopy failed"))));
    child.on("error", reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionPath =
    args.session ?? (await findLatestSession(getDefaultRoot(args.agent ?? "codex")));
  const output = await renderHandoff({
    sessionPath,
    agent: args.agent,
    target: args.target,
  });

  if (args.stdout) {
    process.stdout.write(output);
    return;
  }

  const outputPath =
    args.out ?? path.join(process.cwd(), `agent-handoff-${path.basename(sessionPath, ".jsonl")}.md`);
  await fs.writeFile(outputPath, output, "utf8");
  process.stdout.write(`${outputPath}\n`);

  if (args.copy) {
    const content = await fs.readFile(outputPath, "utf8");
    await copyToClipboard(content);
  }

  if (args.cursor) {
    await runCommand("cursor", [outputPath]);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
