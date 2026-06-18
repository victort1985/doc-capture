#!/usr/bin/env bash
# Exposes the local Doc Capture server (default port 3000) to the internet
# through a Cloudflare Tunnel — free, no port forwarding, no public IP
# needed on this machine.
#
# Two modes, picked automatically:
#
#   1. QUICK TUNNEL (default, zero setup): generates a random
#      https://<random>.trycloudflare.com URL each time this script
#      starts. No Cloudflare account needed. Good for occasional remote
#      access, NOT for a stable URL to put in the mobile app permanently
#      (it changes every restart).
#
#   2. NAMED TUNNEL (set TUNNEL_TOKEN below): a stable URL on your own
#      domain, persists across restarts, and can be gated behind
#      Cloudflare Access (email-based login — see docs/installation-guide.md
#      "Удалённый доступ" section for the one-time setup in the Cloudflare
#      dashboard, completely free for up to 50 users).
#
# Either way: nothing about THIS server changes. The tunnel just makes
# whatever's already listening on localhost:3000 reachable from outside —
# all of this project's own security (JWT auth, rate limiting, HTTPS if
# configured) applies exactly the same to traffic arriving through it.

set -euo pipefail

PORT="${PORT:-3000}"
TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Install it from https://github.com/cloudflare/cloudflared/releases"
  echo "(or: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared)"
  exit 1
fi

if [ -n "$TUNNEL_TOKEN" ]; then
  echo "Starting named tunnel..."
  exec cloudflared tunnel run --token "$TUNNEL_TOKEN"
else
  echo "No TUNNEL_TOKEN set — starting a free quick tunnel (random URL, changes every restart)."
  echo "For a stable URL + email-gated access, see docs/installation-guide.md."
  exec cloudflared tunnel --url "http://localhost:$PORT"
fi
