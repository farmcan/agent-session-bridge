import { readJson } from "../../core/files.js";

export function cleanText(text) {
  return text
    .replace(/^<user_query>\s*/u, "")
    .replace(/\s*<\/user_query>$/u, "")
    .trim();
}

export function joinBlocks(blocks = []) {
  return blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractClaudeText(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function readQoderSidecar(filePath) {
  const sidecarPath = filePath.replace(/\.jsonl$/u, "-session.json");
  try {
    return await readJson(sidecarPath);
  } catch {
    return null;
  }
}
