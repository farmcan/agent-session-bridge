#!/usr/bin/env bash

set -euo pipefail

REPO_TARBALL_URL="https://github.com/farmcan/agent-session-bridge/archive/refs/heads/main.tar.gz"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node is required. Install Node.js 20+ first."
command -v npm >/dev/null 2>&1 || fail "npm is required. Install npm first."

node_major="$(node -p "process.versions.node.split('.')[0]")"
case "$node_major" in
  ''|*[!0-9]*)
    fail "unable to determine Node.js version."
    ;;
esac

if [ "$node_major" -lt 20 ]; then
  fail "Node.js 20+ is required. Current version: $(node -v)"
fi

printf 'Installing kage from %s\n' "$REPO_TARBALL_URL"
npm install -g "$REPO_TARBALL_URL"

printf '\nInstalled.\n'
printf 'Try:\n'
printf '  kage c2x\n'
printf '  kage x2c\n'
printf '  kage x2x\n'
