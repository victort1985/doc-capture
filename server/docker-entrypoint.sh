#!/usr/bin/env sh
# Vixor ERP — Docker entrypoint.
#
# On a brand-new empty database (first container start against a
# fresh Postgres volume), initializes every table from the app's real
# @Entity() classes via TypeORM's synchronize:true — see
# src/scripts/init-tenant-schema.ts's own comment for why this reuses
# the actual entities instead of a hand-maintained migration script.
#
# That script self-guards against a non-empty database (refuses to
# run and exits 1 if any tables already exist), so this is safe to
# run on every container start, not just the first one — after the
# first successful run, every later run is a fast no-op.
set -e

echo "[entrypoint] Checking database schema..."
# The script needs a .env FILE PATH argument, but in Docker all
# config already comes from environment variables (docker-compose's
# `environment:` block) rather than a file — loadEnvFile() gracefully
# no-ops on a path that doesn't exist, so this placeholder is fine.
node dist/scripts/init-tenant-schema.js /app/.env.placeholder || \
  echo "[entrypoint] Schema init skipped (already initialized, or see the error above if this is unexpected on a first run)."

echo "[entrypoint] Starting server..."
exec node dist/main.js
