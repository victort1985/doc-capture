import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY is not set — this should never happen after bootstrap-env runs.');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte (64 hex char) key for AES-256.');
  }
  return key;
}

/** Encrypts a UTF-8 string. Output layout: iv (12) + authTag (16) + ciphertext, base64-encoded. */
export function encryptString(plaintext: string): string {
  return encryptBuffer(Buffer.from(plaintext, 'utf8')).toString('base64');
}

/** Decrypts a string produced by encryptString(). Returns null on any failure (e.g. wrong key, corrupt data) rather than throwing — callers treat that as "couldn't decrypt", not a crash. */
export function decryptString(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptBuffer(Buffer.from(payload, 'base64')).toString('utf8');
  } catch {
    return null;
  }
}

/** Encrypts arbitrary bytes (e.g. a processed document/photo). Same iv+tag+ciphertext layout, returned as a raw Buffer (not base64) since this is written straight to storage. */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
