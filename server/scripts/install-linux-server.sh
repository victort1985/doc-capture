#!/usr/bin/env bash
# Vixor ERP Server — automated Linux installer (Ubuntu/Debian).
#
# Turns the manual steps in docs/installation-guide.md section 2 into
# one script: installs Node.js + PostgreSQL if missing, creates the
# service user, builds the server + admin panel, writes .env, installs
# the systemd unit, and starts the service.
#
# Usage: run from the repo root (or point --source at it):
#   sudo ./server/scripts/install-linux-server.sh
#
# Safe to re-run: an existing app/.env is never overwritten, and the
# systemd unit/service user are simply re-applied.

set -euo pipefail

# ── Config (override via flags or env vars) ─────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/opt/doc-capture}"
SERVICE_USER="${SERVICE_USER:-doccapture}"
DB_NAME="${DB_NAME:-doc_capture}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE_DIR="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --db-name) DB_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "This installer needs root (it creates a system user, installs"
  echo "packages, and writes a systemd unit). Re-run with sudo:"
  echo "  sudo $0"
  exit 1
fi

echo "==> Vixor ERP Server installer"
echo "    Source:      $SOURCE_DIR"
echo "    Install to:  $INSTALL_DIR"
echo "    Service user: $SERVICE_USER"
echo

if [[ ! -f "$SOURCE_DIR/server/package.json" ]]; then
  echo "ERROR: $SOURCE_DIR doesn't look like the project root (no server/package.json found)."
  echo "Run this from the repo root, or pass --source /path/to/doc-capture."
  exit 1
fi

# ── 1. Node.js ───────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js LTS (via NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
else
  echo "==> Node.js already installed: $(node -v)"
fi

# ── 2. PostgreSQL ────────────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  echo "==> Installing PostgreSQL"
  apt-get update -qq
  apt-get install -y postgresql postgresql-contrib
  systemctl enable --now postgresql
else
  echo "==> PostgreSQL already installed"
fi

DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  DB_PASSWORD="$(openssl rand -hex 16)"
  echo "==> Creating database '$DB_NAME' and setting a generated password for the 'postgres' role"
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';"
  sudo -u postgres createdb "$DB_NAME"
  echo "    Generated DB_PASSWORD saved into app/.env below — no need to remember it."
else
  DB_PASSWORD=""
  echo "==> Database '$DB_NAME' already exists — leaving credentials untouched"
fi

# ── 3. Service user ──────────────────────────────────────────────────
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "==> Creating service user '$SERVICE_USER'"
  useradd -r -s /usr/sbin/nologin "$SERVICE_USER"
fi

# ── 4. Build server + admin panel ────────────────────────────────────
echo "==> Installing server dependencies"
( cd "$SOURCE_DIR/server" && npm install --no-audit --no-fund )

echo "==> Building server"
( cd "$SOURCE_DIR/server" && npm run build )

echo "==> Installing admin-panel dependencies"
( cd "$SOURCE_DIR/admin-panel" && npm install --no-audit --no-fund )

echo "==> Building admin panel"
( cd "$SOURCE_DIR/admin-panel" && npm run build )

# ── 5. Deploy files ───────────────────────────────────────────────────
echo "==> Deploying to $INSTALL_DIR/app"
mkdir -p "$INSTALL_DIR/app"
cp -r "$SOURCE_DIR/server/dist" "$INSTALL_DIR/app/dist"
cp -r "$SOURCE_DIR/server/node_modules" "$INSTALL_DIR/app/node_modules"
cp -r "$SOURCE_DIR/server/scripts" "$INSTALL_DIR/app/scripts"
cp "$SOURCE_DIR/server/package.json" "$INSTALL_DIR/app/package.json"
mkdir -p "$INSTALL_DIR/app/public"
cp -r "$SOURCE_DIR/admin-panel/dist/." "$INSTALL_DIR/app/public/"

# .env — created from template on first install only, never overwritten
if [[ ! -f "$INSTALL_DIR/app/.env" ]]; then
  echo "==> Writing app/.env"
  cp "$SOURCE_DIR/server/.env.example" "$INSTALL_DIR/app/.env"
  if [[ -n "$DB_PASSWORD" ]]; then
    { echo ""; echo "DB_PASSWORD=$DB_PASSWORD"; echo "DB_NAME=$DB_NAME"; } >> "$INSTALL_DIR/app/.env"
  fi
else
  echo "==> app/.env already exists — leaving it untouched"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# ── 6. systemd service ────────────────────────────────────────────────
echo "==> Installing systemd service"
sed "s|/opt/doc-capture/app|$INSTALL_DIR/app|g; s|User=doccapture|User=$SERVICE_USER|; s|Group=doccapture|Group=$SERVICE_USER|" \
  "$SOURCE_DIR/server/scripts/doc-capture.service" > /etc/systemd/system/doc-capture.service
systemctl daemon-reload
systemctl enable --now doc-capture

sleep 2
echo
if systemctl is-active --quiet doc-capture; then
  echo "==> ✅ doc-capture.service is running"
else
  echo "==> ⚠️  Service did not start — check: journalctl -u doc-capture -n 50"
fi

IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

Done. Next steps:

1. Create the first admin user:
     cd $INSTALL_DIR/app && sudo -u $SERVICE_USER npm run create-admin -- admin YourPassword he

2. Open the admin panel:
     http://localhost:3000  (or http://${IP_ADDR:-<server-ip>}:3000 from another device)

3. Allow the port through the firewall if needed:
     sudo ufw allow 3000/tcp

Logs:   journalctl -u doc-capture -f
Config: $INSTALL_DIR/app/.env
EOF
