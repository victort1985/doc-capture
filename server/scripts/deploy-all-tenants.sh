#!/usr/bin/env bash
# Vixor ERP — deploy new code to EVERY tenant in one shot.
#
# All tenants share the same compiled dist/ + node_modules/ + admin
# panel build — only their .env differs (DB, port, license). So a
# deploy is: pull + build ONCE, then just restart every tenant's
# systemd instance to pick up the new dist/. No per-tenant rebuild.
#
# Usage: sudo ./deploy-all-tenants.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-/tmp/vixor-update}"
APP_DIR="/opt/doc-capture/app"
TENANTS_DIR="/opt/doc-capture/tenants"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

echo "==> Pulling latest code"
cd "$REPO_DIR" && git checkout -- server/package-lock.json admin-panel/package-lock.json 2>/dev/null || true
git -C "$REPO_DIR" pull origin main

echo "==> Building server"
( cd "$REPO_DIR/server" && npm install --no-audit --no-fund && npm run build )

echo "==> Building admin panel"
( cd "$REPO_DIR/admin-panel" && npm install --no-audit --no-fund && npm run build )

echo "==> Syncing shared build into $APP_DIR"
cp -rv "$REPO_DIR/server/dist/." "$APP_DIR/dist/"
cp -rv "$REPO_DIR/server/src/." "$APP_DIR/src/"
cp -rv "$REPO_DIR/server/node_modules/." "$APP_DIR/node_modules/"
mkdir -p "$APP_DIR/public"
cp -rv "$REPO_DIR/admin-panel/dist/." "$APP_DIR/public/"
chown -R doccapture:doccapture "$APP_DIR"

restarted=0

# Legacy single-tenant service, if this machine hasn't fully migrated
# to per-tenant instances yet.
if systemctl list-units --all 'doc-capture.service' --no-legend | grep -q doc-capture.service; then
  echo "==> Restarting legacy doc-capture.service"
  systemctl restart doc-capture.service
  restarted=$((restarted + 1))
fi

if [[ -d "$TENANTS_DIR" ]]; then
  for tenant_env in "$TENANTS_DIR"/*/.env; do
    [[ -f "$tenant_env" ]] || continue
    slug="$(basename "$(dirname "$tenant_env")")"
    echo "==> Restarting doc-capture@$slug"
    systemctl restart "doc-capture@$slug"
    restarted=$((restarted + 1))
  done
fi

if [[ "$restarted" -eq 0 ]]; then
  echo "==> No running instances found (legacy service or tenants/) — nothing to restart. Is this the first deploy? See provision-tenant.sh."
  exit 0
fi

sleep 3
echo
echo "==> Status:"
if systemctl list-units --all 'doc-capture.service' --no-legend | grep -q doc-capture.service; then
  systemctl is-active --quiet doc-capture.service && echo "  doc-capture.service: ✅ active" || echo "  doc-capture.service: ⚠️  NOT active — check: journalctl -u doc-capture -n 50"
fi
if [[ -d "$TENANTS_DIR" ]]; then
  for tenant_env in "$TENANTS_DIR"/*/.env; do
    [[ -f "$tenant_env" ]] || continue
    slug="$(basename "$(dirname "$tenant_env")")"
    systemctl is-active --quiet "doc-capture@$slug" && echo "  doc-capture@$slug: ✅ active" || echo "  doc-capture@$slug: ⚠️  NOT active — check: journalctl -u doc-capture@$slug -n 50"
  done
fi

echo
echo "Deployed to $restarted instance(s)."
