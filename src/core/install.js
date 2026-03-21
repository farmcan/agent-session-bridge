import path from "node:path";

import { getDefaultRoot, normalizeAgent } from "./agents.js";

function resolveCodexInstallPath(fileName) {
  const match = fileName.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T/u);
  if (!match) {
    throw new Error(`Unable to derive Codex session install path from file name: ${fileName}`);
  }

  const [, year, month, day] = match;
  return path.join(getDefaultRoot("codex"), year, month, day, fileName);
}

function resolveClaudeInstallPath(projectKey, fileName) {
  return path.join(getDefaultRoot("claude"), projectKey, fileName);
}

function resolveDefaultTmpPath(fileName) {
  return path.join(process.cwd(), "tmp", "agent-session-bridge", fileName);
}

function withPath(file, filePath) {
  return { ...file, path: filePath };
}

function replaceExtension(filePath, pattern, replacement, fallbackSuffix) {
  if (pattern.test(filePath)) {
    return filePath.replace(pattern, replacement);
  }
  return `${filePath}${fallbackSuffix}`;
}

export function resolveInstallPlan({ args, exported, targetAgent }) {
  if (args.out) {
    if (exported.mode === "qoder-session") {
      return {
        files: [
          withPath(exported.files[0], args.out),
          withPath(exported.files[1], replaceExtension(args.out, /\.jsonl$/u, "-session.json", "-session.json")),
        ],
        resumeCommand: null,
      };
    }

    return { files: [withPath(exported.files[0], args.out)], resumeCommand: null };
  }

  if (args.outputDir) {
    const files = exported.files.map((file) => withPath(file, path.join(args.outputDir, file.fileName)));
    return {
      files,
      resumeCommand: null,
    };
  }

  if (exported.mode === "codex-session" && normalizeAgent(targetAgent) === "codex") {
    const outputPath = resolveCodexInstallPath(exported.files[0].fileName);
    return {
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: `codex resume ${exported.sessionId}`,
    };
  }

  if (exported.mode === "claude-session" && normalizeAgent(targetAgent) === "claude") {
    const outputPath = resolveClaudeInstallPath(exported.projectKey, exported.files[0].fileName);
    return {
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: `claude --resume ${exported.sessionId}`,
    };
  }

  return {
    files: exported.files.map((file) => withPath(file, resolveDefaultTmpPath(file.fileName))),
    resumeCommand: null,
  };
}
