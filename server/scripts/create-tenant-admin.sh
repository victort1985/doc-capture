#!/usr/bin/env bash
# Vixor ERP — create (or reset) an admin user in ONE tenant's database.
#
# Usage: sudo ./create-tenant-admin.sh <slug> <username> <password> [language]
#
# Reuses the existing server/scripts/create-admin.js unchanged — that
# script only fills in DB_* env vars that aren't already set
# (see its loadEnvFile), so sourcing the tenant's own .env first here
# makes it operate on that tenant's database instead of the default
# one, with no changes needed to create-admin.js itself.

set -euo pipefail

SLUG="${1:?Usage: create-tenant-admin.sh <slug> <username> <password> [language]}"
USERNAME="${2:?username required}"
PASSWORD="${3:?password required}"
LANGUAGE="${4:-he}"

if [[ ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: slug must be lowercase letters, digits, and dashes only." >&2
  exit 1
fi

TENANT_ENV="/opt/doc-capture/tenants/$SLUG/.env"
if [[ ! -f "$TENANT_ENV" ]]; then
  echo "ERROR: no tenant found at $TENANT_ENV" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$TENANT_ENV"
set +a

cd /opt/doc-capture/app
node scripts/create-admin.js "$USERNAME" "$PASSWORD" "$LANGUAGE"
