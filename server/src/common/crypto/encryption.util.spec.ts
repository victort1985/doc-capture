import { encryptString, decryptString, encryptBuffer, decryptBuffer } from './encryption.util';

describe('encryption.util', () => {
  const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    // A valid 32-byte (64 hex char) key — tests must not depend on
    // whatever real key bootstrap-env happens to have generated on
    // this machine.
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  describe('encryptString / decryptString', () => {
    it.each([
      ['short string', 'hello'],
      ['empty-adjacent string', ' '],
      ['unicode/Hebrew text', 'הצעת מחיר מספר 1234'],
      ['long string', 'x'.repeat(5000)],
      ['app-password-shaped string', 'abcd efgh ijkl mnop'],
    ])('round-trips %s', (_label, value) => {
      const encrypted = encryptString(value);
      expect(decryptString(encrypted)).toBe(value);
    });

    it('never returns the plaintext as the encrypted output (AC6)', () => {
      const value = 'super-secret-app-password';
      const encrypted = encryptString(value);
      expect(encrypted).not.toBe(value);
      expect(encrypted).not.toContain(value);
    });

    it('produces different ciphertext for the same plaintext on repeated calls (random IV)', () => {
      const value = 'same-input-twice';
      const a = encryptString(value);
      const b = encryptString(value);
      expect(a).not.toBe(b);
      // ...but both still decrypt back to the same original value.
      expect(decryptString(a)).toBe(value);
      expect(decryptString(b)).toBe(value);
    });

    it('returns null (not a throw) for null/undefined/empty input', () => {
      expect(decryptString(null)).toBeNull();
      expect(decryptString(undefined)).toBeNull();
      expect(decryptString('')).toBeNull();
    });

    it('returns null (not a throw) for corrupted/garbage payloads', () => {
      expect(decryptString('not-valid-base64-encrypted-data')).toBeNull();
    });

    it('fails to decrypt under a different key (wrong key does not silently succeed)', () => {
      const value = 'secret-under-key-a';
      const encrypted = encryptString(value);
      process.env.ENCRYPTION_KEY = 'b'.repeat(64);
      try {
        expect(decryptString(encrypted)).toBeNull();
      } finally {
        process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      }
    });
  });

  describe('encryptBuffer / decryptBuffer', () => {
    it('round-trips arbitrary binary data', () => {
      const original = Buffer.from([0, 1, 2, 255, 254, 128, 10, 13]);
      const encrypted = encryptBuffer(original);
      const decrypted = decryptBuffer(encrypted);
      expect(decrypted.equals(original)).toBe(true);
    });
  });
});
