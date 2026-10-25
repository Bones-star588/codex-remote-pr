#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This service installer requires macOS." >&2
  exit 1
fi
if [[ "${1:-}" != "" && "${1:-}" != "--no-start" ]]; then
  echo "Usage: bash scripts/install-service.sh [--no-start]" >&2
  exit 1
fi
if ! NODE_BIN="$(command -v node)"; then
  echo "Node.js 22.19 or newer was not found. Install Node.js first." >&2
  exit 1
fi

if [[ ! -f dist-server/server/index.js ]]; then
  echo "Build output is missing. Run npm run build first." >&2
  exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.codex.remote.plist"
if [[ -f "$PLIST" ]]; then
  OWNER="$(/usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' "$PLIST")"
  if [[ "$OWNER" != "$ROOT_DIR" ]]; then
    echo "The existing Codex Remote service belongs to another checkout: $OWNER" >&2
    exit 1
  fi
fi

"$NODE_BIN" --input-type=module - "$ROOT_DIR" "$NODE_BIN" "$PLIST" <<'NODE'
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const [root, node, plist] = process.argv.slice(2);
const dataDir = path.resolve(process.env.DATA_DIR?.trim() || 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(plist), { recursive: true });
const escape = (value) => String(value).replace(/[<>&"']/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[char]));
const string = (value) => `<string>${escape(value)}</string>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${string('com.codex.remote')}
  <key>ProgramArguments</key>
  <array>${string(node)}${string(path.join(root, 'dist-server/server/index.js'))}</array>
  <key>WorkingDirectory</key>${string(root)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>${string(`${path.dirname(node)}:${process.env.PATH || ''}`)}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key>${string(path.join(dataDir, 'codex-remote.out.log'))}
  <key>StandardErrorPath</key>${string(path.join(dataDir, 'codex-remote.err.log'))}
</dict>
</plist>
`;
fs.writeFileSync(plist, xml, 'utf8');
NODE

plutil -lint "$PLIST"
echo "Installed $PLIST"
if [[ "${1:-}" != "--no-start" ]]; then
  exec bash "$ROOT_DIR/scripts/remote-control-macos.sh" Start --no-browser
fi
