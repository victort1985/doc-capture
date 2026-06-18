#!/usr/bin/env bash
# Builds a self-contained payload for the Windows installer:
# server (compiled JS + production node_modules) + admin-panel build as
# static files served by the same Nest process.
#
# Requires: this script run from server/, with admin-panel/ as a sibling.
# Output: server/payload-windows/  (consumed by installer/installer.nsi)

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$(pwd)/.."
PAYLOAD="$(pwd)/payload-windows"

echo "==> Cleaning previous payload"
rm -rf "$PAYLOAD"
mkdir -p "$PAYLOAD/app"

echo "==> Building server"
npm run build

echo "==> Installing production-only dependencies into a clean copy (target: win32/x64)"
rm -rf /tmp/server-prod-build
mkdir -p /tmp/server-prod-build
cp package.json package-lock.json /tmp/server-prod-build/
( cd /tmp/server-prod-build && npm install --omit=dev --os=win32 --cpu=x64 --no-audit --no-fund )

echo "==> Building admin-panel"
( cd "$ROOT/admin-panel" && npm run build )

echo "==> Assembling payload"
cp -r dist "$PAYLOAD/app/dist"
cp -r scripts "$PAYLOAD/app/scripts"
rm -f "$PAYLOAD/app/scripts/package-windows.sh"  # build-time only, not needed at runtime
rm -f "$PAYLOAD/app/scripts/doc-capture.service"  # Linux-only (systemd)
cp -r /tmp/server-prod-build/node_modules "$PAYLOAD/app/node_modules"
cp package.json "$PAYLOAD/app/package.json"
cp .env.example "$PAYLOAD/app/.env.example"
mkdir -p "$PAYLOAD/app/public"
cp -r "$ROOT/admin-panel/dist/." "$PAYLOAD/app/public/"

echo "==> Payload ready at $PAYLOAD"
du -sh "$PAYLOAD"
