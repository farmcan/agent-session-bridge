import { renderClaudeSessionExport } from "./claude-session.js";
import { renderCodexSessionExport } from "./codex-session.js";
import { renderQoderSessionExport } from "./qoder-session.js";
import { renderSessionStoryHtmlExport } from "./session-story-html.js";

const exporters = {
  "claude-session": renderClaudeSessionExport,
  "codex-session": renderCodexSessionExport,
  "qoder-session": renderQoderSessionExport,
  "session-story-html": renderSessionStoryHtmlExport,
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
