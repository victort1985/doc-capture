#!/usr/bin/env bash
# Vixor ERP — permanently remove a tenant's running instance and database.
#
# Usage: sudo ./deprovision-tenant.sh <slug>
#
# Does NOT touch the license record itself (that's the caller's job —
# the license-admin web UI deletes the license row after this
# succeeds). This only tears down the actual server + data.

set -euo pipefail

SLUG="${1:?Usage: deprovision-tenant.sh <slug>}"

if [[ ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: slug must be lowercase letters, digits, and dashes only." >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

DB_NAME="vixor_${SLUG//-/_}"
TENANT_DIR="/opt/doc-capture/tenants/$SLUG"

echo "==> Stopping and disabling doc-capture@$SLUG"
systemctl disable --now "doc-capture@$SLUG" 2>/dev/null || echo "    (was not running)"

echo "==> Dropping database $DB_NAME"
sudo -u postgres dropdb --if-exists "$DB_NAME"

echo "==> Removing $TENANT_DIR"
rm -rf "$TENANT_DIR"

echo "==> Done. $SLUG's server, database, and config are gone."
