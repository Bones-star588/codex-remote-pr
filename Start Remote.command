#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! bash "$ROOT_DIR/scripts/remote-control-macos.sh" Start; then
  read -r -p "Unable to start. Press Enter to close." _
  exit 1
fi
