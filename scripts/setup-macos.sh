#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22.19 or newer first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
NODE_MINOR="$(node -p 'Number(process.versions.node.split(".")[1])')"
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 19) )); then
  echo "Node.js 22.19 or newer is required. Current: $(node --version)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

echo "==> Installing dependencies"
npm install

echo "==> Building"
npm run build

if [[ ! -f data/auth.json ]]; then
  echo "==> Setting the access password"
  npm run set-password
else
  echo "==> Existing password configuration found"
fi

echo "==> Done"
echo "Start locally with: npm start"
echo "Then open: http://127.0.0.1:${PORT:-4545}"
