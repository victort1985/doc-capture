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
