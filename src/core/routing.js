import { normalizeAgent } from "./agents.js";

export const routeAliases = {
  x2x: { agent: "x", target: "x" },
  x2c: { agent: "x", target: "c" },
  x2q: { agent: "x", target: "q" },
  c2c: { agent: "c", target: "c" },
  c2x: { agent: "c", target: "x" },
  c2q: { agent: "c", target: "q" },
  q2x: { agent: "q", target: "x" },
  q2c: { agent: "q", target: "c" },
};

const exportCapabilities = new Map(
  [
    ["claude:claude", { format: "claude-session", resumable: true, fork: true }],
    ["claude:codex", { format: "codex-session", resumable: true }],
    ["codex:claude", { format: "claude-session", resumable: true }],
    ["codex:codex", { format: "codex-session", resumable: true, fork: true }],
    ["qoder:codex", { format: "codex-session", resumable: true }],
    ["qodercli:codex", { format: "codex-session", resumable: true }],
    ["qoder:claude", { format: "claude-session", resumable: true }],
    ["qodercli:claude", { format: "claude-session", resumable: true }],
    ["codex:qoder", { format: "qoder-session", resumable: false }],
    ["codex:qodercli", { format: "qoder-session", resumable: false }],
    ["claude:qoder", { format: "qoder-session", resumable: false }],
    ["claude:qodercli", { format: "qoder-session", resumable: false }],
  ].map(([key, value]) => [key, value]),
);

const defaultAliasExportFormats = {
  c2c: "claude-session",
  x2c: "claude-session",
  c2x: "codex-session",
  x2x: "codex-session",
  q2x: "codex-session",
  q2c: "claude-session",
  x2q: "qoder-session",
  c2q: "qoder-session",
};

function capabilityKey(sourceAgent, targetAgent) {
  return `${normalizeAgent(sourceAgent)}:${normalizeAgent(targetAgent)}`;
}

export function getExportCapability(sourceAgent, targetAgent) {
  return exportCapabilities.get(capabilityKey(sourceAgent, targetAgent)) ?? null;
}

export function inferDefaultExportFormat(args) {
  if (args.exportFormat) {
    return args;
  }

  const aliasFormat = args.routeAlias ? defaultAliasExportFormats[args.routeAlias] : null;
  if (aliasFormat) {
    return { ...args, exportFormat: aliasFormat };
  }

  const capability = getExportCapability(args.agent, args.target);
  if (capability) {
    return { ...args, exportFormat: capability.format };
  }

  return args;
}
