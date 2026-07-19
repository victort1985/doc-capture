# Vixor License Server

Standalone service — lives ONLY on your own machine, never on a
customer's server. Issues and verifies `hex64` license keys for
Vixor ERP installs.

## First-time setup

```bash
cd license-server
npm install
cp .env.example .env

# 1. Generate the signing keypair (once, ever — don't regenerate later
#    unless you're OK re-keying every existing customer install)
npm run keygen
# Paste the PRIVATE key output into .env as LICENSE_PRIVATE_KEY
# Keep the PUBLIC key output — it goes into the Vixor ERP client app,
# see server/src/modules/license/license.constants.ts

# 2. Generate a random ADMIN_JWT_SECRET and put it in .env too:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Create your own login for the admin UI:
node scripts/create-admin.js yourname a-strong-password

# 4. Start it
npm start
```

Admin UI: `http://<this-machine>:4100/admin-ui/admin.html`

## Running it permanently (systemd, same pattern as the main server)

```ini
[Unit]
Description=Vixor License Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/license-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/path/to/license-server/.env
User=youruser

[Install]
WantedBy=multi-user.target
```

## Exposing it to the internet

Every customer's Vixor ERP server needs to reach `POST /verify` on
this machine — put it behind a reverse proxy with HTTPS (Caddy/Nginx +
Let's Encrypt), same as discussed for the main server. The `/admin-ui`
path should ideally be firewalled to your own IP only, or at minimum
rely on the login — it's your control panel for every customer's
license.

## What each customer needs from you

Just the `hex64` key generated in the admin UI. Nothing else — the
public verification key is already baked into the Vixor ERP app they
install.

## Provisioning new tenants and deploying updates from the admin UI

The admin UI can create a brand-new tenant (database + license +
running instance, all in one click) and push code updates to every
tenant, instead of you SSHing in and running scripts by hand. This
works by having the license-server process itself run
`server/scripts/provision-tenant.sh` and `server/scripts/deploy-all-tenants.sh`
from the main Vixor ERP repo.

**Requires:**

1. A persistent clone of the main repo on this machine (not `/tmp` —
   that can get cleared):
   ```bash
   git clone https://github.com/victort1985/doc-capture.git /opt/vixor-repo
   ```
   Set `VIXOR_REPO_DIR=/opt/vixor-repo` in this server's `.env` if you
   put it somewhere else.

2. Passwordless `sudo` for whichever OS user runs this license-server
   process, scoped to just what provisioning/deploy actually need —
   add to `/etc/sudoers.d/vixor-license-server` (via `visudo -f`):
   ```
   license_server_user ALL=(ALL) NOPASSWD: /usr/bin/bash /opt/vixor-repo/server/scripts/provision-tenant.sh *
   license_server_user ALL=(ALL) NOPASSWD: /usr/bin/bash /opt/vixor-repo/server/scripts/deploy-all-tenants.sh
   license_server_user ALL=(ALL) NOPASSWD: /usr/bin/bash /opt/vixor-repo/server/scripts/deprovision-tenant.sh *
   license_server_user ALL=(ALL) NOPASSWD: /usr/bin/bash /opt/vixor-repo/server/scripts/create-tenant-admin.sh *
   ```
   Replace `license_server_user` with the actual account. Keeping the
   allowed commands scoped to these two specific scripts (rather than
   blanket sudo) means a bug or compromise in this Node process still
   can't run arbitrary root commands — only these two, and only with
   the exact script paths above (the `*` covers script arguments, not
   arbitrary extra commands).

3. `PUBLIC_LICENSE_SERVER_URL` in `.env` if this isn't reachable at
   `localhost:<PORT>` from the machine running tenant instances (e.g.
   if they're on a different host) — gets baked into each new tenant's
   `.env` as `LICENSE_SERVER_URL`.

Without the above, the "New tenant" and "Deploy now" buttons in the
admin UI will fail with a permissions or path error — the regular
manual `provision-tenant.sh` / `deploy-all-tenants.sh` CLI usage still
works fine independent of any of this.

## Automatic subdomain creation (Cloudflare)

Without this, every new tenant needs a manual step in the Cloudflare
dashboard (Zero Trust → Tunnels → your tunnel → Public Hostname →
Add). With it, leaving the "Public URL" field blank when creating a
tenant automatically adds the DNS record and tunnel route for
`<slug>.<TENANT_BASE_DOMAIN>` — no dashboard visit needed.

**Requires**, all in `.env`:

1. `CLOUDFLARE_API_TOKEN` — create at
   dash.cloudflare.com → My Profile → API Tokens → Create Token
   (custom token), with these permissions:
   - Account → Cloudflare Tunnel → Edit
   - Zone → DNS → Edit (scoped to your domain's zone)

2. `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard → any domain →
   right sidebar shows it.

3. `CLOUDFLARE_ZONE_ID` — same right sidebar, for the specific zone
   (e.g. doc-capture.app).

4. `CLOUDFLARE_TUNNEL_ID` — Zero Trust → Networks → Tunnels → click
   your existing tunnel → the ID in the URL/overview (the same tunnel
   already serving app.doc-capture.app and license.doc-capture.app —
   this reuses it, never creates a second tunnel).

5. `TENANT_BASE_DOMAIN` — defaults to `doc-capture.app`.

**Important:** the tunnel configuration update (`PUT
.../cfd_tunnel/{id}/configurations`) replaces the *entire* ingress
rule list — cloudflare-dns.js always reads the current list first and
only adds/removes the one rule for the tenant in question, so existing
hostnames are never touched. Still, the first time you use this,
watch the "New tenant" output carefully and spot-check
`app.doc-capture.app` / `license.doc-capture.app` still resolve
afterward.

If any of the four Cloudflare env vars are missing, this feature is
silently skipped — the tenant still gets created, you just fall back
to setting the Public URL by hand via the 🔗 Connection button (same
as before this existed).
