import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("install.sh exists and documents the GitHub installer flow", async () => {
  const installPath = path.join(__dirname, "..", "install.sh");
  const content = await fs.readFile(installPath, "utf8");

  assert.match(content, /^#!\/usr\/bin\/env bash/m);
  assert.match(content, /node/i);
  assert.match(content, /npm/i);
  assert.match(content, /https:\/\/github\.com\/farmcan\/agent-session-bridge\/archive\/refs\/heads\/main\.tar\.gz/);
  assert.match(content, /npm install -g/);
  assert.match(content, /kage c2x/);
});
