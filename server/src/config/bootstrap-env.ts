import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Loads KEY=VALUE pairs from a .env file into process.env, without
 * overwriting anything already set in the real environment.
 *
 * Why this exists instead of relying on @nestjs/config's ConfigModule:
 * AppModule's `ConfigModule.forRoot()` call only runs once Nest evaluates
 * AppModule's own `@Module(...)` decorator — but by then, every OTHER
 * module that AppModule imports (AuthModule, etc.) has *already* had its
 * own `@Module(...)` decorator evaluated, because `import` statements are
 * resolved before the importing file's own top-level code runs. Any module
 * that reads `process.env.X` directly inside a decorator argument (e.g.
 * `JwtModule.register({ secret: process.env.JWT_SECRET })`) was reading it
 * too early and always seeing the value from *before* ConfigModule had a
 * chance to load the .env file — silently falling back to whatever
 * hardcoded default was coded next to it. Loading .env here, synchronously,
 * before main.ts ever imports AppModule, closes that gap for good.
 */
export function loadEnvFile(envPath: string): void {
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

/**
 * If JWT_SECRET is missing or still the documented placeholder, generate a
 * real random one and persist it back into the .env file so it survives
 * restarts (a secret that changes every restart would invalidate every
 * existing session each time). Logs a one-line notice either way.
 */
export function ensureJwtSecret(envPath: string): void {
  const current = process.env.JWT_SECRET;
  if (current && current !== 'change_me') return;

  const generated = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET = generated;

  // eslint-disable-next-line no-console
  console.log('[Setup] JWT_SECRET was unset or left as the default — generated a new random secret.');

  try {
    let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^JWT_SECRET=.*$/m.test(contents)) {
      contents = contents.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${generated}`);
    } else {
      contents += `${contents.endsWith('\n') || contents === '' ? '' : '\n'}JWT_SECRET=${generated}\n`;
    }
    fs.writeFileSync(envPath, contents, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[Setup] Saved the new JWT_SECRET to ${envPath} — it will be reused on future restarts.`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Setup] Could not persist the generated JWT_SECRET to ${envPath} (${(err as Error).message}). ` +
        'It will be regenerated on every restart, invalidating existing sessions each time — ' +
        'set JWT_SECRET manually in .env to avoid this.',
    );
  }
}

/**
 * Same idea as ensureJwtSecret, for the symmetric key used to encrypt
 * storage-connection passwords (and optionally file contents) at rest —
 * see src/common/crypto/encryption.util.ts. Kept as a separate key from
 * JWT_SECRET on purpose: rotating/leaking one shouldn't force rotating
 * the other, and they protect different things.
 */
export function ensureEncryptionKey(envPath: string): void {
  const current = process.env.ENCRYPTION_KEY;
  if (current && current !== 'change_me') return;

  const generated = crypto.randomBytes(32).toString('hex'); // AES-256 key
  process.env.ENCRYPTION_KEY = generated;

  // eslint-disable-next-line no-console
  console.log('[Setup] ENCRYPTION_KEY was unset or left as the default — generated a new random key.');

  try {
    let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^ENCRYPTION_KEY=.*$/m.test(contents)) {
      contents = contents.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${generated}`);
    } else {
      contents += `${contents.endsWith('\n') || contents === '' ? '' : '\n'}ENCRYPTION_KEY=${generated}\n`;
    }
    fs.writeFileSync(envPath, contents, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[Setup] Saved the new ENCRYPTION_KEY to ${envPath} — it will be reused on future restarts.`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Setup] Could not persist the generated ENCRYPTION_KEY to ${envPath} (${(err as Error).message}). ` +
        'A new key on every restart means previously-encrypted storage passwords become unreadable — ' +
        'set ENCRYPTION_KEY manually in .env to avoid this.',
    );
  }
}
