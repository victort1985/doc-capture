#!/usr/bin/env node
/**
 * Creates a user with role=admin (or resets password + promotes an existing
 * one). Run this once after the server's first start — TypeORM's
 * `synchronize` creates the schema on that first run, so the `users` table
 * needs to already exist before this script can insert into it.
 *
 * Usage:
 *   node scripts/create-admin.js <username> <password> [language]
 *   language defaults to "he" (he|en|ru)
 *
 * No extra dependencies beyond what the server already ships with
 * (pg, bcryptjs) — deliberately self-contained .env parsing below so this
 * keeps working from the installed Windows payload too.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const [username, password, language] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: node scripts/create-admin.js <username> <password> [language=he]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  loadEnvFile(path.join(__dirname, '..', '.env'));

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'doc_capture',
  });

  try {
    await client.connect();
  } catch (err) {
    console.error('Could not connect to PostgreSQL. Check DB_* values in .env.');
    console.error(err.message);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await client.query(
      `INSERT INTO users (username, "passwordHash", role, language, "isActive")
       VALUES ($1, $2, 'admin', $3, true)
       ON CONFLICT (username) DO UPDATE
       SET "passwordHash" = EXCLUDED."passwordHash", role = 'admin', "isActive" = true`,
      [username, passwordHash, language || 'he'],
    );
    console.log(`Admin user "${username}" is ready.`);
  } catch (err) {
    console.error(
      'Insert failed — has the server been started at least once yet? ' +
        '(first start creates the "users" table)',
    );
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
