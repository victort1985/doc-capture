require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { signPayload } = require('./crypto-sign');
const { provisionTenant, deployAll, deprovisionTenant, createTenantAdmin } = require('./provision');
const { encryptConnectionFile } = require('./connection-file');
const { provisionTenantHostname, deprovisionTenantHostname, cloudflareAutomationEnabled } = require('./cloudflare-dns');

const app = express();
app.use(express.json());
app.use('/admin-ui', express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) throw new Error('ADMIN_JWT_SECRET is not set in .env');

// ── Public: called by every Vixor ERP client install ──────────────────
app.post('/verify', (req, res) => {
  const { key } = req.body || {};
  const checkedAt = new Date().toISOString();

  if (!key || typeof key !== 'string') {
    const { payloadJson, signature } = signPayload({ valid: false, reason: 'missing_key', checkedAt });
    return res.status(400).json({ payloadJson, signature });
  }

  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);

  if (!license) {
    const { payloadJson, signature } = signPayload({ valid: false, reason: 'not_found', checkedAt });
    return res.json({ payloadJson, signature });
  }
  if (license.status === 'revoked') {
    const { payloadJson, signature } = signPayload({ valid: false, reason: 'revoked', checkedAt });
    return res.json({ payloadJson, signature });
  }

  db.prepare(`
    UPDATE licenses SET last_checked_at = ?, last_check_ip = ?,
      activated_at = COALESCE(activated_at, ?)
    WHERE id = ?
  `).run(checkedAt, req.ip, checkedAt, license.id);

  const { payloadJson, signature } = signPayload({ valid: true, checkedAt, customerName: license.customer_name, maxDevices: license.max_devices });
  res.json({ payloadJson, signature });
});

// ── Admin auth ──────────────────────────────────────────────────────
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

/** Completes a password reset started with
 * scripts/generate-reset-token.js on the server itself — no prior
 * login needed (that's the whole point of a "forgot password" flow),
 * just a valid, unexpired token. The token's hash is compared with
 * crypto.timingSafeEqual rather than ===/db lookup-by-value, so this
 * endpoint's response time doesn't leak how many hash characters
 * matched to an attacker guessing token values. */
app.post('/admin/reset-password', (req, res) => {
  const { username, token, newPassword } = req.body || {};
  if (!username || !token || !newPassword) {
    return res.status(400).json({ error: 'username, token, and newPassword are all required' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !user.reset_token_hash || !user.reset_token_expires) {
    return res.status(400).json({ error: 'No reset in progress for this user — generate a new token from the server terminal.' });
  }
  if (new Date(user.reset_token_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link has expired — generate a new one from the server terminal.' });
  }

  const suppliedHash = crypto.createHash('sha256').update(token).digest('hex');
  const storedHash = user.reset_token_hash;
  const matches = suppliedHash.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(storedHash));
  if (!matches) {
    return res.status(400).json({ error: 'Invalid reset token' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?').run(newHash, user.id);
  res.json({ success: true });
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Admin: license management ──────────────────────────────────────
app.get('/admin/licenses', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/admin/licenses', requireAdmin, (req, res) => {
  const { customerName, notes, maxDevices } = req.body || {};
  if (!customerName) return res.status(400).json({ error: 'customerName is required' });
  const key = crypto.randomBytes(32).toString('hex'); // hex64
  const info = db.prepare('INSERT INTO licenses (key, customer_name, notes, max_devices) VALUES (?, ?, ?, ?)')
    .run(key, customerName, notes || null, Number(maxDevices) > 0 ? Number(maxDevices) : 5);
  res.json(db.prepare('SELECT * FROM licenses WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/admin/licenses/:id/max-devices', requireAdmin, (req, res) => {
  const { maxDevices } = req.body || {};
  if (!(Number(maxDevices) > 0)) return res.status(400).json({ error: 'maxDevices must be a positive number' });
  db.prepare('UPDATE licenses SET max_devices = ? WHERE id = ?').run(Number(maxDevices), req.params.id);
  res.json(db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id));
});

app.post('/admin/licenses/:id/revoke', requireAdmin, (req, res) => {
  db.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id));
});

app.post('/admin/licenses/:id/reactivate', requireAdmin, (req, res) => {
  db.prepare("UPDATE licenses SET status = 'active' WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id));
});

app.delete('/admin/licenses/:id', requireAdmin, async (req, res) => {
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
  if (!license) return res.status(404).json({ error: 'Not found' });

  let output = '';
  // Always attempt teardown, not just when license.provisioned is
  // set — a provisioning attempt that failed PARTWAY through (the
  // exact scenario that produces a stuck "slug already exists" row —
  // provisioned stays 0, but provision-tenant.sh may already have
  // created a real database/systemd service before it errored out)
  // would otherwise leave that real infrastructure permanently
  // orphaned and untracked once this row is deleted. deprovision-
  // tenant.sh is deliberately idempotent for exactly this reason
  // (systemctl disable --now || echo "(was not running)", dropdb
  // --if-exists, rm -rf) — safe to run even when nothing was ever
  // actually provisioned, so there's no longer a reason to skip it.
  try {
    output = await deprovisionTenant(license.slug);
  } catch (err) {
    // Leave the license row in place if teardown fails — better to
    // surface a stuck/half-deleted tenant for manual cleanup than
    // to silently lose the record while a real server + database
    // are still running somewhere.
    return res.status(500).json({ error: err.message, output: err.output || '' });
  }

  if (license.provisioned) {
    const baseDomain = process.env.TENANT_BASE_DOMAIN || 'doc-capture.app';
    if (cloudflareAutomationEnabled() && license.public_url && license.public_url.endsWith(baseDomain)) {
      try {
        await deprovisionTenantHostname(license.slug);
        output += '\n\n🌐 DNS + tunnel route removed.';
      } catch (cfErr) {
        output += `\n\n⚠️ Server/database removed, but Cloudflare cleanup failed: ${cfErr.message}\nRemove the "${license.slug}.${baseDomain}" hostname manually in the Cloudflare dashboard.`;
      }
    }
  }

  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
  res.json({ deleted: true, output });
});

// ── Admin: infrastructure orchestration ──────────────────────────────
// These run real shell scripts on this machine (createdb, systemctl,
// npm build) — see provision.js's doc comment and README.md's sudoers
// section. Only ever reachable behind requireAdmin.
app.post('/admin/tenants', requireAdmin, async (req, res) => {
  const { customerName, port, maxDevices, dbPassword, publicUrl } = req.body || {};
  const slug = (req.body?.slug || '').toLowerCase();
  if (!slug || !customerName || !port || !dbPassword) {
    return res.status(400).json({ error: 'slug, customerName, port, and dbPassword are all required.' });
  }
  const existingBySlug = db.prepare('SELECT id FROM licenses WHERE slug = ?').get(slug);
  if (existingBySlug) {
    // A slug collision here is almost always a STUCK row from an
    // earlier provisioning attempt that failed partway through (the
    // license row is deliberately kept on failure — see the catch
    // block below — so it can be investigated, but that also means
    // this exact 409 is the normal, expected shape of "retry a failed
    // provision"). Returning the existing row's own id lets the admin
    // UI offer "delete it and retry" directly from this error,
    // instead of the admin having to separately find and remove the
    // stuck row through the licenses table first.
    return res.status(409).json({ error: `A tenant with slug "${slug}" already exists.`, existingLicenseId: existingBySlug.id });
  }

  const key = crypto.randomBytes(32).toString('hex');
  const info = db.prepare(`
    INSERT INTO licenses (key, customer_name, notes, max_devices, slug, port, db_name, public_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(key, customerName, null, Number(maxDevices) > 0 ? Number(maxDevices) : 5, slug, Number(port), `vixor_${slug.replace(/-/g, '_')}`, publicUrl || null);

  try {
    const output = await provisionTenant({
      slug, customerName, port: Number(port), maxDevices: Number(maxDevices) || 5, licenseKey: key, dbPassword,
    });

    let cloudflareNote = '';
    if (!publicUrl && cloudflareAutomationEnabled()) {
      try {
        const autoUrl = await provisionTenantHostname(slug, Number(port));
        db.prepare('UPDATE licenses SET public_url = ? WHERE id = ?').run(autoUrl.replace(/^https?:\/\//, ''), info.lastInsertRowid);
        cloudflareNote = `\n\n🌐 DNS + tunnel route created automatically: ${autoUrl}`;
      } catch (cfErr) {
        cloudflareNote = `\n\n⚠️ Server provisioned, but Cloudflare DNS/tunnel setup failed: ${cfErr.message}\nSet the Public URL manually via the 🔗 Connection button once DNS is sorted out.`;
      }
    }

    db.prepare('UPDATE licenses SET provisioned = 1 WHERE id = ?').run(info.lastInsertRowid);
    res.json({ license: db.prepare('SELECT * FROM licenses WHERE id = ?').get(info.lastInsertRowid), output: output + cloudflareNote });
  } catch (err) {
    // Leave the license row in place (provisioned=0) — the slug/port/
    // key are reserved and visible in the admin UI, and provisioning
    // can be investigated/retried by hand using the printed output
    // rather than silently losing the attempt.
    res.status(500).json({ error: err.message, output: err.output || '' });
  }
});

// In-memory deploy job state — this is a single-process internal tool
// used by one admin at a time, so a plain module-level variable is
// enough; no job queue/database needed. Kept intentionally simple.
let deployJob = { running: false, output: '', error: null, startedAt: null, finishedAt: null };

app.post('/admin/deploy', requireAdmin, (req, res) => {
  if (deployJob.running) {
    return res.status(409).json({ error: 'A deploy is already in progress.', startedAt: deployJob.startedAt });
  }
  // Deliberately NOT awaited here — the whole point of this change.
  // deployAll() can legitimately take several minutes (npm install +
  // build across the whole stack, see provision.js's own 15-minute
  // internal timeout, "builds can be slow on a modest machine"), and
  // holding the HTTP response open that whole time was the actual
  // bug: whatever sits between the browser and this process (reverse
  // proxy, Cloudflare Tunnel, or the browser's own fetch handling)
  // was cutting the connection well before the real work finished,
  // surfacing as a bare "Load failed" with no useful information -
  // the deploy itself may well have still been running, or even
  // succeeding, server-side with no way for the admin to see that.
  // Returning immediately and letting the client poll status instead
  // means no single request ever needs to stay open more than a
  // moment, regardless of what timeout anything in between imposes.
  deployJob = { running: true, output: '', error: null, startedAt: new Date().toISOString(), finishedAt: null };
  deployAll()
    .then((output) => { deployJob = { ...deployJob, running: false, output, finishedAt: new Date().toISOString() }; })
    .catch((err) => { deployJob = { ...deployJob, running: false, output: err.output || '', error: err.message, finishedAt: new Date().toISOString() }; });
  res.status(202).json({ started: true });
});

app.get('/admin/deploy/status', requireAdmin, (req, res) => {
  res.json(deployJob);
});

app.post('/admin/licenses/:id/connection-info', requireAdmin, (req, res) => {
  const { publicUrl, cfAccessClientId, cfAccessClientSecret } = req.body || {};
  if (!publicUrl) return res.status(400).json({ error: 'publicUrl is required' });
  if (cfAccessClientSecret !== undefined) {
    db.prepare('UPDATE licenses SET public_url = ?, cf_access_client_id = ?, cf_access_client_secret = ? WHERE id = ?')
      .run(publicUrl, cfAccessClientId || null, cfAccessClientSecret || null, req.params.id);
  } else {
    db.prepare('UPDATE licenses SET public_url = ?, cf_access_client_id = ? WHERE id = ?')
      .run(publicUrl, cfAccessClientId || null, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id));
});

app.get('/admin/licenses/:id/connection-file', requireAdmin, (req, res) => {
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
  if (!license) return res.status(404).json({ error: 'Not found' });
  if (!license.public_url) return res.status(400).json({ error: 'Set this organization\'s Public URL first.' });

  const payload = license.cf_access_client_id
    ? { mode: 'cloud', address: license.public_url, clientId: license.cf_access_client_id, clientSecret: license.cf_access_client_secret }
    : { mode: 'direct', address: license.public_url };

  const fileBuffer = encryptConnectionFile(payload);
  const safeSlug = (license.slug || license.customer_name).toString().replace(/[^a-z0-9-]/gi, '-');
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeSlug}.vxconn"`,
  });
  res.send(fileBuffer);
});

app.post('/admin/licenses/:id/create-admin', requireAdmin, async (req, res) => {
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
  if (!license) return res.status(404).json({ error: 'Not found' });
  if (!license.slug || !license.provisioned) {
    return res.status(400).json({ error: 'This license has no provisioned tenant to create an admin user in.' });
  }
  const { username, password, language } = req.body || {};
  try {
    const output = await createTenantAdmin({ slug: license.slug, username, password, language });
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message, output: err.output || '' });
  }
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => console.log(`Vixor license server listening on :${PORT}`));
