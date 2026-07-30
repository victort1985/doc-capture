#!/usr/bin/env bash
# Vixor ERP — automated backup for every tenant database.
#
# Requirement #16 of the Israeli tax-authority compliance checklist
# ("резервное копирование") — dumps every tenant's Postgres database
# to a dated, compressed file, keeping BACKUP_RETENTION_DAYS worth of
# history and deleting anything older. Reads which databases exist
# directly from each tenant's own .env (DB_DATABASE) under
# /opt/doc-capture/tenants/*, the same source of truth
# deploy-all-tenants.sh already uses — no separate tenant list to keep
# in sync by hand.
#
# Usage: sudo ./backup-all-tenants.sh
# Cron (daily at 3am): 0 3 * * * /opt/doc-capture/app/server/scripts/backup-all-tenants.sh >> /var/log/vixor-backup.log 2>&1

set -euo pipefail

TENANTS_DIR="${TENANTS_DIR:-/opt/doc-capture/tenants}"
BACKUP_DIR="${BACKUP_DIR:-/opt/doc-capture/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE_STAMP="$(date +%Y-%m-%d_%H%M%S)"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo (needs to read as postgres and write under $BACKUP_DIR)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [[ ! -d "$TENANTS_DIR" ]]; then
  echo "No $TENANTS_DIR directory found — nothing to back up." >&2
  exit 0
fi

FAILED=0

for tenant_env in "$TENANTS_DIR"/*/.env; do
  [[ -f "$tenant_env" ]] || continue
  slug="$(basename "$(dirname "$tenant_env")")"
  db_name="$(grep -m1 '^DB_DATABASE=' "$tenant_env" | cut -d= -f2-)"

  if [[ -z "$db_name" ]]; then
    echo "==> Skipping $slug: no DB_DATABASE found in $tenant_env"
    continue
  fi

  out_dir="$BACKUP_DIR/$slug"
  mkdir -p "$out_dir"
  plain_file="$out_dir/${db_name}_${DATE_STAMP}.sql.gz"
  enc_file="${plain_file}.enc"

  enc_key="$(grep -m1 '^ENCRYPTION_KEY=' "$tenant_env" | cut -d= -f2-)"

  echo "==> Backing up $slug ($db_name) -> $enc_file"
  if sudo -u postgres pg_dump "$db_name" | gzip > "$plain_file"; then
    if [[ -n "$enc_key" ]]; then
      iv="$(openssl rand -hex 16)"
      if openssl enc -aes-256-cbc -K "$enc_key" -iv "$iv" -pbkdf2 -in "$plain_file" -out "${enc_file}.body" 2>/dev/null; then
        printf '%s\n' "$iv" > "${enc_file}.iv"
        cat "${enc_file}.iv" "${enc_file}.body" > "$enc_file"
        rm -f "$plain_file" "${enc_file}.iv" "${enc_file}.body"
        echo "    OK, encrypted ($(du -h "$enc_file" | cut -f1))"
      else
        echo "    Encryption FAILED — leaving unencrypted dump at $plain_file" >&2
        FAILED=1
      fi
    else
      echo "    WARNING: no ENCRYPTION_KEY found in $tenant_env — backup left unencrypted at $plain_file" >&2
    fi
  else
    echo "    FAILED — see error above" >&2
    rm -f "$plain_file"
    FAILED=1
  fi
done

echo "==> Pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" \( -name '*.sql.gz' -o -name '*.sql.gz.enc' \) -mtime "+$RETENTION_DAYS" -print -delete

if [[ "$FAILED" -eq 1 ]]; then
  echo "==> One or more tenant backups FAILED — see above." >&2
  exit 1
fi

echo "==> All tenant backups completed successfully."
