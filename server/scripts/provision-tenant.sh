#!/usr/bin/env bash
# Vixor ERP — provision a brand-new tenant (Variant B: separate DB +
# separate process per company, shared codebase).
#
# Usage:
#   sudo ./provision-tenant.sh <slug> "<Customer Name>" <port> [maxDevices]
#
# Example:
#   sudo ./provision-tenant.sh company-a "Company A Ltd" 4101 10
#
# Needs LICENSE_ADMIN_USER / LICENSE_ADMIN_PASS env vars set (your own
# login for the license server's admin API) to auto-create the license.
# Set LICENSE_SERVER_URL too if it's not on localhost:4100.

set -euo pipefail

SLUG="${1:?Usage: provision-tenant.sh <slug> \"<Customer Name>\" <port> [maxDevices]}"
CUSTOMER_NAME="${2:?Customer name required}"
PORT="${3:?Port required}"
MAX_DEVICES="${4:-5}"

if [[ ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: slug must be lowercase letters, digits, and dashes only (used in DB name, systemd instance name, tenants/ folder)." >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # server/
REPO_ROOT="$(cd "$SOURCE_DIR/.." && pwd)"
TENANT_DIR="/opt/doc-capture/tenants/$SLUG"
DB_NAME="vixor_${SLUG//-/_}"
LICENSE_SERVER_URL="${LICENSE_SERVER_URL:-http://localhost:4100}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo — creates a system-level DB, systemd unit, and files under /opt." >&2
  exit 1
fi

if [[ -d "$TENANT_DIR" ]]; then
  echo "ERROR: $TENANT_DIR already exists — this tenant looks already provisioned." >&2
  exit 1
fi

echo "==> Provisioning tenant '$SLUG' ($CUSTOMER_NAME), port $PORT, max $MAX_DEVICES devices"

# ── 1. Database ──────────────────────────────────────────────────────
echo "==> Creating database $DB_NAME"
sudo -u postgres createdb "$DB_NAME"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO doccapture;"

# Needed to write the tenant's .env — Postgres never gives back a
# usable plaintext password for an existing role, so this has to come
# from you. Set DOCCAPTURE_DB_PASSWORD when calling this script
# non-interactively (e.g. from the license-admin web UI); only prompts
# if running in a real terminal with nothing set.
if [[ -n "${DOCCAPTURE_DB_PASSWORD:-}" ]]; then
  DB_PASSWORD="$DOCCAPTURE_DB_PASSWORD"
elif [[ -t 0 ]]; then
  read -rsp "Postgres password for role 'doccapture' (same one every other tenant uses): " DB_PASSWORD
  echo
else
  echo "ERROR: DOCCAPTURE_DB_PASSWORD is not set and there's no terminal to prompt on." >&2
  exit 1
fi

# ── 2. Tenant .env ────────────────────────────────────────────────────
echo "==> Writing $TENANT_DIR/.env"
mkdir -p "$TENANT_DIR"
sed \
  -e "s|__PORT__|$PORT|" \
  -e "s|__DB_PASSWORD__|$DB_PASSWORD|" \
  -e "s|__DB_DATABASE__|$DB_NAME|" \
  -e "s|__LICENSE_SERVER_URL__|$LICENSE_SERVER_URL|" \
  "$SOURCE_DIR/scripts/tenant.env.template" > "$TENANT_DIR/.env"
chown -R doccapture:doccapture "$TENANT_DIR"

# ── 3. License ────────────────────────────────────────────────────────
if [[ -n "${PREGENERATED_LICENSE_KEY:-}" ]]; then
  LICENSE_KEY="$PREGENERATED_LICENSE_KEY"
  echo "==> Using pre-generated license key"
elif [[ -n "${LICENSE_ADMIN_USER:-}" && -n "${LICENSE_ADMIN_PASS:-}" ]]; then
  echo "==> Creating license via $LICENSE_SERVER_URL"
  TOKEN=$(curl -sf -X POST "$LICENSE_SERVER_URL/admin/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$LICENSE_ADMIN_USER\",\"password\":\"$LICENSE_ADMIN_PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
  LICENSE_JSON=$(curl -sf -X POST "$LICENSE_SERVER_URL/admin/licenses" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$CUSTOMER_NAME\",\"maxDevices\":$MAX_DEVICES,\"notes\":\"slug: $SLUG\"}")
  LICENSE_KEY=$(node -pe "JSON.parse(process.argv[1]).key" "$LICENSE_JSON")
  echo "    License key: $LICENSE_KEY"
else
  echo "==> LICENSE_ADMIN_USER/LICENSE_ADMIN_PASS not set — skipping auto license creation."
  echo "    Generate one manually at $LICENSE_SERVER_URL/admin-ui/admin.html"
  LICENSE_KEY="(generate manually)"
fi

# ── 4. Build (if not already built) + schema init ───────────────────
if [[ ! -f /opt/doc-capture/app/dist/main.js ]]; then
  echo "==> No shared build found yet — building once"
  ( cd "$SOURCE_DIR" && npm install --no-audit --no-fund && npm run build )
  mkdir -p /opt/doc-capture/app
  cp -r "$SOURCE_DIR/dist" /opt/doc-capture/app/dist
  cp -r "$SOURCE_DIR/node_modules" /opt/doc-capture/app/node_modules
fi

echo "==> Initializing schema for $DB_NAME"
( cd /opt/doc-capture/app && node dist/scripts/init-tenant-schema.js "$TENANT_DIR/.env" )

# ── 5. systemd ────────────────────────────────────────────────────────
if [[ ! -f /etc/systemd/system/doc-capture@.service ]]; then
  cp "$SOURCE_DIR/scripts/doc-capture@.service" /etc/systemd/system/doc-capture@.service
  systemctl daemon-reload
fi
systemctl enable --now "doc-capture@$SLUG"
sleep 2
systemctl is-active --quiet "doc-capture@$SLUG" && echo "==> ✅ doc-capture@$SLUG is running" \
  || echo "==> ⚠️  Service didn't start — check: journalctl -u doc-capture@$SLUG -n 50"

# ── 6. Auto-activate the license we just generated ──────────────────
if [[ "$LICENSE_KEY" != "(generate manually)" ]]; then
  echo "==> Activating license on the new instance"
  sleep 2
  curl -sf -X POST "http://localhost:$PORT/api/license/activate" \
    -H 'Content-Type: application/json' \
    -d "{\"key\":\"$LICENSE_KEY\"}" >/dev/null \
    && echo "    ✅ Activated" \
    || echo "    ⚠️  Auto-activation failed — activate manually in the admin panel with the key above."
fi

cat <<EOF

Done. Next steps:

1. Create the tenant's first admin user:
     cd /opt/doc-capture/app && sudo -u doccapture DB_DATABASE=$DB_NAME npm run create-admin -- admin YourPassword he
   (or set the tenant's full env: sudo -u doccapture env \$(cat $TENANT_DIR/.env | xargs) npm run create-admin -- admin YourPassword he)

2. Point a subdomain at this instance (nginx/Caddy), proxying to
   127.0.0.1:$PORT — e.g. company-a.vixor-erp.com

3. Give the customer their license key: $LICENSE_KEY

4. Build the mobile app pointed at their subdomain, or use the
   in-app "Connection settings" screen to change the server URL.

Tenant config: $TENANT_DIR/.env
Logs:          journalctl -u doc-capture@$SLUG -f
EOF
