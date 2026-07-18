const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'licenses.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'revoked'
    max_devices INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT,                           -- set on first successful verify
    last_checked_at TEXT,                         -- updated on every successful verify
    last_check_ip TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
`);

// Safe to re-run: fails harmlessly if the column already exists (fresh
// installs get it from the CREATE TABLE above already).
try { db.exec('ALTER TABLE licenses ADD COLUMN max_devices INTEGER NOT NULL DEFAULT 5'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN slug TEXT'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN port INTEGER'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN db_name TEXT'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN provisioned INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN public_url TEXT'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN cf_access_client_id TEXT'); } catch {}
try { db.exec('ALTER TABLE licenses ADD COLUMN cf_access_client_secret TEXT'); } catch {}

module.exports = db;
