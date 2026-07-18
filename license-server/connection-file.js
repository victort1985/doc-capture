const crypto = require('crypto');

const SHARED_SECRET = process.env.CONNECTION_FILE_KEY;
if (!SHARED_SECRET) {
  throw new Error('CONNECTION_FILE_KEY is not set in .env — run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

// Same derivation the mobile app performs (see
// mobile-client/lib/services/connection_file_crypto.dart) — one
// shared secret baked into every client, split into a separate
// encryption key and MAC key so neither is reused for both purposes.
function deriveKeys() {
  const encKey = crypto.createHash('sha256').update(SHARED_SECRET + ':enc').digest();
  const macKey = crypto.createHash('sha256').update(SHARED_SECRET + ':mac').digest();
  return { encKey, macKey };
}

/** File layout: [16-byte IV][32-byte HMAC-SHA256][ciphertext].
 * HMAC covers (IV || ciphertext) — encrypt-then-MAC, verified before
 * decrypting on the read side so a tampered/corrupted file is
 * rejected outright rather than decrypted into garbage. */
function encryptConnectionFile(payloadObj) {
  const { encKey, macKey } = deriveKeys();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const hmac = crypto.createHmac('sha256', macKey).update(Buffer.concat([iv, ciphertext])).digest();
  return Buffer.concat([iv, hmac, ciphertext]);
}

module.exports = { encryptConnectionFile };
