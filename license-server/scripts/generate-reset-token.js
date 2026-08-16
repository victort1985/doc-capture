// Usage: node scripts/generate-reset-token.js <username>
//
// Prints a one-time reset token good for 1 hour, plus the full URL to
// use it at. This is the "forgot password" flow for a tool with no
// email/SMS to fall back on — running this from the terminal (SSH
// access to the machine hosting the license server) IS the identity
// check, the same way physical/SSH access already implicitly is for
// running scripts/create-admin.js directly. The difference from just
// running create-admin.js again is that this lets you set the new
// password through the actual web UI rather than needing to know a
// plaintext password on the command line at all (it never touches
// argv, shell history, etc.).
const crypto = require('crypto');
const db = require('../db');

const [, , username] = process.argv;
if (!username) {
  console.error('Usage: node scripts/generate-reset-token.js <username>');
  process.exit(1);
}

const user = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
if (!user) {
  console.error(`No admin user named '${username}' — check scripts/create-admin.js output or the admin_users table for the exact username.`);
  process.exit(1);
}

// The raw token is shown once, here, and never stored anywhere —
// only its SHA-256 hash goes in the database, same principle as a
// password hash (a stolen DB dump alone can't be used to complete a
// reset, since the raw token isn't recoverable from its hash).
const rawToken = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

db.prepare('UPDATE admin_users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?').run(tokenHash, expires, user.id);

const baseUrl = process.env.LICENSE_PUBLIC_URL || 'https://license.vixor.app';
console.log(`Reset token generated for '${username}', valid for 1 hour.`);
console.log('');
console.log(`Open this URL to set a new password:`);
console.log(`${baseUrl}/reset-password.html?username=${encodeURIComponent(username)}&token=${rawToken}`);
