#!/usr/bin/env bash
# Vixor ERP — restore a single tenant database from a backup made by
# backup-all-tenants.sh.
#
# Usage: sudo ./restore-tenant.sh <slug> <backup-file.sql.gz>
#
# DESTRUCTIVE: drops and recreates the tenant's database before
# restoring. Stops the tenant's service first so nothing writes to the
# database mid-restore, and restarts it afterward.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

SLUG="${1:-}"
BACKUP_FILE="${2:-}"
TENANTS_DIR="${TENANTS_DIR:-/opt/doc-capture/tenants}"

if [[ -z "$SLUG" || -z "$BACKUP_FILE" ]]; then
  echo "Usage: sudo $0 <slug> <backup-file.sql.gz>" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

TENANT_ENV="$TENANTS_DIR/$SLUG/.env"
if [[ ! -f "$TENANT_ENV" ]]; then
  echo "No tenant found at $TENANT_ENV" >&2
  exit 1
fi

DB_NAME="$(grep -m1 '^DB_DATABASE=' "$TENANT_ENV" | cut -d= -f2-)"
if [[ -z "$DB_NAME" ]]; then
  echo "Could not read DB_DATABASE from $TENANT_ENV" >&2
  exit 1
fi

echo "This will PERMANENTLY REPLACE the '$DB_NAME' database (tenant '$SLUG') with the contents of:"
echo "  $BACKUP_FILE"
read -r -p "Type the tenant slug ('$SLUG') to confirm: " CONFIRM
if [[ "$CONFIRM" != "$SLUG" ]]; then
  echo "Confirmation did not match — aborted, nothing was changed."
  exit 1
fi

echo "==> Stopping doc-capture@$SLUG"
systemctl stop "doc-capture@$SLUG" || true

echo "==> Dropping and recreating $DB_NAME"
sudo -u postgres dropdb --if-exists "$DB_NAME"
sudo -u postgres createdb "$DB_NAME"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO doccapture;"

echo "==> Restoring from backup"
gunzip -c "$BACKUP_FILE" | sudo -u postgres psql -d "$DB_NAME"

echo "==> Restarting doc-capture@$SLUG"
systemctl start "doc-capture@$SLUG"

echo "==> Done. Tenant '$SLUG' restored from $BACKUP_FILE"
