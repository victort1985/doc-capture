const { execFile } = require('child_process');
const path = require('path');

const REPO_DIR = process.env.VIXOR_REPO_DIR || '/opt/vixor-repo';

/** Runs a command with array-form args only — never string-interpolate
 * user input into a shell command. `sudo -n` (non-interactive) fails
 * fast instead of hanging if passwordless sudo isn't set up for the
 * license-server's OS user — see license-server/README.md for the
 * sudoers snippet this depends on. */
function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      env: { ...process.env, ...env },
      maxBuffer: 50 * 1024 * 1024,
      timeout: 15 * 60 * 1000, // builds can be slow on a modest machine
    }, (err, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`;
      if (err) return reject(Object.assign(new Error(`${cmd} exited with ${err.code}`), { output }));
      resolve(output);
    });
  });
}

const SLUG_RE = /^[a-z0-9-]+$/;

/** Runs provision-tenant.sh with an already-created license key (this
 * process created the license row directly in its own DB — no need
 * to loop back over HTTP to itself). */
async function provisionTenant({ slug, customerName, port, maxDevices, licenseKey, dbPassword }) {
  if (!SLUG_RE.test(slug)) throw new Error('Slug must be lowercase letters, digits, and dashes only.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535.');
  if (!dbPassword) throw new Error('dbPassword is required (the Postgres password for the doccapture role).');

  const scriptPath = path.join(REPO_DIR, 'server', 'scripts', 'provision-tenant.sh');
  const licenseServerUrl = process.env.PUBLIC_LICENSE_SERVER_URL || `http://localhost:${process.env.PORT || 4100}`;
  // sudo strips environment variables by default (SETENV isn't
  // granted in the sudoers rule this depends on) — pass sensitive/
  // config values as script arguments instead, which sudo always
  // forwards regardless of env-stripping.
  return run('sudo', [
    '-n', 'bash', scriptPath,
    slug, customerName, String(port), String(maxDevices || 5),
    dbPassword, licenseKey, licenseServerUrl,
  ]);
}

/** Runs deploy-all-tenants.sh — build once, restart every tenant instance. */
async function deployAll() {
  const scriptPath = path.join(REPO_DIR, 'server', 'scripts', 'deploy-all-tenants.sh');
  return run('sudo', ['-n', 'bash', scriptPath], { REPO_DIR });
}

/** Stops the tenant's service and permanently drops its database —
 * irreversible. Caller (server.js) deletes the license row after this
 * succeeds. */
async function deprovisionTenant(slug) {
  if (!SLUG_RE.test(slug)) throw new Error('Slug must be lowercase letters, digits, and dashes only.');
  const scriptPath = path.join(REPO_DIR, 'server', 'scripts', 'deprovision-tenant.sh');
  return run('sudo', ['-n', 'bash', scriptPath, slug]);
}

/** Creates (or resets the password of) an admin user in one tenant's
 * own database — see create-tenant-admin.sh's doc comment. */
async function createTenantAdmin({ slug, username, password, language }) {
  if (!SLUG_RE.test(slug)) throw new Error('Slug must be lowercase letters, digits, and dashes only.');
  if (!username || !password) throw new Error('username and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const scriptPath = path.join(REPO_DIR, 'server', 'scripts', 'create-tenant-admin.sh');
  return run('sudo', ['-n', 'bash', scriptPath, slug, username, password, language || 'he']);
}

module.exports = { provisionTenant, deployAll, deprovisionTenant, createTenantAdmin, SLUG_RE };
