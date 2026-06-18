Doc Capture — Windows server
=============================

Prerequisites (install once, before first run):
  1. Node.js LTS  -> https://nodejs.org
  2. PostgreSQL   -> https://www.postgresql.org/download/windows/

First run:
  1. Start menu -> "Doc Capture" -> "Start Doc Capture Server"
     (this also creates app\.env from the template on first launch)
  2. Edit app\.env (DB_HOST/DB_USERNAME/DB_PASSWORD/DB_DATABASE, JWT_SECRET)
     to match your PostgreSQL setup, then restart the server.
  3. Start menu -> "Doc Capture" -> "Create Admin User", or run
     create-admin.bat <username> <password> [he|en|ru] from the install
     folder, to create the first admin account.
  4. Start menu -> "Doc Capture" -> "Open Admin Panel" — or open
     http://localhost:3000 in a browser, and log in.

Mobile app: point it at this machine's address on port 3000
(e.g. http://<this-pc-ip>:3000/api) — see mobile-client/README.md.

Uninstall: Windows Settings -> Apps -> Doc Capture -> Uninstall.
