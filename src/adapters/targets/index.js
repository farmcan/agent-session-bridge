import { renderClaudeSessionExport } from "./claude-session.js";
import { renderCodexSessionExport } from "./codex-session.js";
import { renderHandoff, renderHandoffExport, renderStartPrompt } from "./handoff.js";
import { renderQoderSessionExport } from "./qoder-session.js";

const exporters = {
  "claude-session": renderClaudeSessionExport,
  "codex-session": renderCodexSessionExport,
  handoff: renderHandoffExport,
  "qoder-session": renderQoderSessionExport,
};

export function getTargetExporter(format) {
  const exporter = exporters[format];
  if (!exporter) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  return exporter;
}

export function renderExport(format, options) {
  return getTargetExporter(format)(options);
}

export { renderHandoff, renderStartPrompt };
