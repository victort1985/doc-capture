# Vixor ERP server — multi-stage build.
#
# Requirement #21 ("Docker") — containerizes ONE tenant's server
# process, matching the existing systemd doc-capture@<slug> pattern
# (see server/scripts/provision-tenant.sh) rather than redesigning
# multi-tenancy around Docker: each tenant still gets its own
# container + .env + database, just started with `docker run`/compose
# instead of systemctl. The bare-metal systemd deploy this project
# already uses (deploy-all-tenants.sh) keeps working unchanged — this
# is an additional option, not a replacement.
#
# IMPORTANT: build from the REPO ROOT, not from server/ — this
# Dockerfile needs both server/ and admin-panel/ (the server serves
# the built admin panel itself, see app.module.ts's publicDir), and
# Docker's COPY can't reach outside its build context:
#
#   docker build -f server/Dockerfile -t vixor-erp-server .
#
# See docker-compose.yml at the repo root for the full stack
# (server + Postgres) wired together, which handles this for you.

# ── Build stage: server ──────────────────────────────────────────
FROM node:20-bookworm-slim AS build-server
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig*.json server/nest-cli.json ./
COPY server/src ./src
RUN npm run build

# ── Build stage: admin panel ─────────────────────────────────────
# The server serves the admin panel itself from a `public/` directory
# sitting alongside dist/ (see app.module.ts's publicDir) — same
# single-process model the bare-metal deploy already uses, just built
# here instead of copied in by deploy-all-tenants.sh.
FROM node:20-bookworm-slim AS build-admin
WORKDIR /admin
COPY admin-panel/package*.json ./
RUN npm ci
COPY admin-panel/. .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY --from=build-server /app/dist ./dist
COPY --from=build-admin /admin/dist ./public

# Runs as a non-root user — same reasoning as the systemd deploy using
# a dedicated `doccapture` service account rather than root.
RUN useradd --system --create-home --shell /usr/sbin/nologin doccapture \
    && chown -R doccapture:doccapture /app
USER doccapture

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/auth/login', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
