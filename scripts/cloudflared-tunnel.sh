#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is required. Run: brew install cloudflared" >&2
  exit 1
fi

read -r -p "Public hostname (for example codex.example.com): " PUBLIC_HOST
if [[ -z "$PUBLIC_HOST" ]]; then
  echo "No hostname provided." >&2
  exit 1
fi

TUNNEL_NAME="${TUNNEL_NAME:-codex-remote}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:${PORT:-4545}}"
TUNNEL_PROTOCOL="${TUNNEL_PROTOCOL:-http2}"
case "$TUNNEL_PROTOCOL" in
  auto|http2|quic) ;;
  *) echo "TUNNEL_PROTOCOL must be auto, http2, or quic." >&2; exit 1 ;;
esac

echo "==> Opening Cloudflare login"
cloudflared tunnel login

echo "==> Creating or reusing tunnel ${TUNNEL_NAME}"
if ! cloudflared tunnel list | awk '{print $2}' | grep -qx "$TUNNEL_NAME"; then
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list | awk -v name="$TUNNEL_NAME" '$2 == name {print $1; exit}')"
if [[ -z "$TUNNEL_ID" ]]; then
  echo "Unable to resolve tunnel id for ${TUNNEL_NAME}" >&2
  exit 1
fi

echo "==> Routing ${PUBLIC_HOST} to tunnel"
cloudflared tunnel route dns "$TUNNEL_NAME" "$PUBLIC_HOST"

CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" <<YAML
tunnel: ${TUNNEL_ID}
protocol: ${TUNNEL_PROTOCOL}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  - hostname: ${PUBLIC_HOST}
    service: ${LOCAL_URL}
  - service: http_status:404
YAML

echo "==> Updating .env"
if [[ -f .env ]]; then
  awk '!/^(PUBLIC_ORIGIN|ALLOWED_ORIGINS)=/' .env > .env.tmp
  mv .env.tmp .env
fi
{
  echo "PUBLIC_ORIGIN=https://${PUBLIC_HOST}"
  echo "ALLOWED_ORIGINS=https://${PUBLIC_HOST}"
} >> .env

echo "==> Installing cloudflared service"
sudo cloudflared service install

echo "==> Tunnel complete"
echo "Open https://${PUBLIC_HOST}"
