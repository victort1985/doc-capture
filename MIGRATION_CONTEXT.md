# Vixor ERP — Migration Context for New Chat
## Generated: 2026-07-03

---

## PROJECT IDENTITY
- **Name**: Vixor ERP (formerly Doc Capture → Operix → Vixor)
- **Repo**: https://github.com/victort1985/doc-capture
- **PAT**: YOUR_GITHUB_PAT
- **Current version**: v1.0.21
- **Stack**: NestJS + PostgreSQL + React + Flutter

---

## SERVER (NEW PC — Ubuntu)
- **User**: user@ubuntu
- **Local IP**: 192.168.252.100
- **Tailscale IP**: 100.102.196.117
- **App dir**: /opt/doc-capture/app
- **Service**: doc-capture.service (systemd, enabled)
- **DB**: doc_capture, user: doccapture, password: m7v25rbr
- **Domains**: app.doc-capture.app (Cloudflare Access), sign.doc-capture.app (public)
- **Cloudflare Tunnel**: ba3fe13a-43d0-494f-bc85-259aff139db7
- **Credentials**: /home/user/.cloudflared/ba3fe13a-43d0-494f-bc85-259aff139db7.json
- **Storage disk**: /run/media/user/DB (UUID: f70566c5-a1c4-4dc6-a11f-f6c22ec953cf, auto-mounted via fstab)
- **SFTP user**: vixorsftp, password: ksdjfkg, path: /run/media/user/DB

## DEPLOY COMMANDS
```bash
cd ~/deploy
git pull
cd server && npm install && npm run build
sudo rsync -a --delete --exclude='.env' --exclude='public' --exclude='public-sign' ./ /opt/doc-capture/app/
sudo cp -r public-sign /opt/doc-capture/app/
sudo chown -R doccapture:doccapture /opt/doc-capture/app
sudo systemctl restart doc-capture

cd ~/deploy/admin-panel && npm install && npm run build
sudo rm -rf /opt/doc-capture/app/public/assets/*
sudo cp -r dist/* /opt/doc-capture/app/public/
sudo chown -R doccapture:doccapture /opt/doc-capture/app/public
```

---

## CI/CD WORKFLOWS
- **Mobile**: workflow ID 298072068 (mobile-build.yml) → iOS + Android
- **Flutter Desktop**: workflow ID 302918798 (desktop-flutter-build.yml) → Linux + Windows
- **Electron Desktop**: workflow ID 302819101 (desktop-build.yml) → Win/Mac/Linux AppImage

## BUILD ARTIFACTS
- **Android APK**: GitHub Release v1.0.21 → app-release.apk
- **iOS IPA**: GitHub Release v1.0.21 → vixor-erp-ios-unsigned.ipa (install via Signulous)
- **Linux Flutter**: branch build-desktop-linux-flutter → vixor-erp-linux-desktop.tar.gz
- **Windows Flutter**: branch build-desktop-win → .exe
- **Electron**: GitHub Release → Vixor-ERP-1.0.x.AppImage / .exe / .dmg

## LINUX DESKTOP INSTALL
```bash
rm -rf /tmp/vixor-flutter-dl
git clone --depth 1 --branch build-desktop-linux-flutter \
  https://YOUR_GITHUB_PAT@github.com/victort1985/doc-capture.git \
  /tmp/vixor-flutter-dl
rm -rf ~/apps/vixor-flutter/*
tar -xzf /tmp/vixor-flutter-dl/vixor-erp-linux-desktop.tar.gz -C ~/apps/vixor-flutter
chmod +x ~/apps/vixor-flutter/vixor_erp
~/apps/vixor-flutter/vixor_erp
```

---

## KEY FILES ON SERVER
- `/opt/doc-capture/app/.env` — DB_USERNAME=doccapture, DB_PASSWORD=m7v25rbr, PORT=3000, NODE_ENV=production, JWT_SECRET=auto
- `/etc/cloudflared/config.yml` — tunnel config
- `/etc/systemd/system/doc-capture.service`
- `/etc/fstab` — DB disk automount

## .ENV CONTENT
```
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=doccapture
DB_PASSWORD=m7v25rbr
DB_NAME=doc_capture
PORT=3000
NODE_ENV=production
JWT_SECRET=9f92e83ea8b6d9cc9a739053dc7681b0...
ENCRYPTION_KEY=14f7697dcfed91fec21344abc6c4be85...
FIREBASE_SERVICE_ACCOUNT_PATH=/opt/doc-capture/secrets/firebase-service-account.json
```

---

## OPEN ISSUES / PENDING TASKS

### 1. Linux Desktop — No visible changes after update
- Binary is v1.0.21 (Jul 3 16:07) ✅
- App launches but changes not visible
- **Need to diagnose**: new StampMark icon (navy square with V), "Домашняя" tab in Russian mode
- Possible cause: app connects to server, server-side changes may need re-login to take effect

### 2. Mobile App — Install new version
- Download from: https://github.com/victort1985/doc-capture/releases/tag/v1.0.21
- app-release.apk (Android) or vixor-erp-ios-unsigned.ipa (iOS via Signulous)
- Changes in v1.0.21:
  - Client name search with contact/location autocomplete (bug: selection was not working → FIXED)
  - Delivered to search (phonebook only)
  - Lessor signature auto-fill with user's name (firstName + lastName from profile)
  - Item barcode scanner + warehouse search
  - Org switcher on Stock screen
  - New Vixor ERP icon (navy square with V + orange bar)

### 3. Admin Panel
- Organization logo now visible (SuperAdminGuard removed)
- Users editor: multi-org checkboxes (PRIMARY + allowed orgs)
- Permissions: "Switch between organizations" option
- Delivery Notes: no "D" prefix on note numbers, org filter dropdown

### 4. Delivery Notes — Remote Signing Auto-fill
- When client signs remotely (signer name + role), these are saved to:
  - `deliveredTo` = signerName
  - `recipientRole` = signerRole
- `lessorSignerName` column added to DB ✅

---

## RECENT CHANGES (v1.0.15 → v1.0.21)
- v1.0.15: Client search (contacts+locations), item barcode, warehouse autocomplete
- v1.0.16: App renamed to "Vixor ERP", navHome → "Домашняя" (RU), desktop CI fixes
- v1.0.17: Firebase package name kept (com.doccapture.doc_capture), display name → Vixor ERP
- v1.0.18: Fix client search selection (_selecting flag), lessor name auto-fill, new StampMark icon
- v1.0.19: Fix AppState import + flutter create --project-name vixor_erp
- v1.0.20: Desktop auth stub with firstName/lastName/fullName
- v1.0.21: Bump pubspec to 1.0.21+121

---

## TECH STACK DETAILS
- **Server**: NestJS, TypeORM, PostgreSQL, JWT auth, Helmet, Throttler
- **Admin Panel**: React + Vite + TypeScript
- **Mobile**: Flutter (dart), Provider state management
- **Desktop Flutter**: Linux + Windows builds via CI
- **Desktop Electron**: Wraps web app, publishes to GitHub Releases
- **Tunnel**: Cloudflare Zero Trust (Access for admin, public for sign)
- **Storage**: SFTP (vixorsftp) → /run/media/user/DB

## IMPORTANT ARCHITECTURE NOTES
- Organization switching via `X-Active-Org` header (mobile sends, server reads)
- `allowedOrganizationIds` field on users (jsonb array) controls org switching
- `orgs.switch` permission in Permissions page controls who can switch
- JWT includes: id, username, role, language, organizationId, allowedOrganizationIds, permissions, firstName, lastName
- Delivery notes scoped by org via `getActiveOrgId()` helper
- All desktop CI builds replace auth_service.dart with stub (no flutter_secure_storage_windows)
