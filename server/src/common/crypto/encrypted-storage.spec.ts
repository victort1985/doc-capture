import { StorageAdapter } from '../../infra/storage/storage-adapter.interface';
import { writeMaybeEncrypted, readMaybeEncrypted } from './encrypted-storage.util';

function fakeAdapter(): StorageAdapter & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    write: jest.fn(async (path: string, data: Buffer) => { files.set(path, data); return path; }),
    read: jest.fn(async (path: string) => {
      const data = files.get(path);
      if (!data) throw new Error('not found');
      return data;
    }),
    rename: jest.fn(),
    exists: jest.fn(async (path: string) => files.has(path)),
    remove: jest.fn(),
    testConnection: jest.fn(async () => ({ ok: true, message: 'ok' })),
  };
}

describe('encrypted-storage.util', () => {
  const original = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex, matches encryption.util's expected key format
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  it('stores the file unencrypted and without a suffix when encryptAtRest is false', async () => {
    const adapter = fakeAdapter();
    const plaintext = Buffer.from('hello world');
    const finalPath = await writeMaybeEncrypted(adapter, 'docs/a.pdf', plaintext, false);

    expect(finalPath).toBe('docs/a.pdf');
    expect(adapter.files.get('docs/a.pdf')).toEqual(plaintext);
  });

  it('encrypts the file and appends .enc when encryptAtRest is true', async () => {
    const adapter = fakeAdapter();
    const plaintext = Buffer.from('sensitive invoice contents');
    const finalPath = await writeMaybeEncrypted(adapter, 'docs/b.pdf', plaintext, true);

    expect(finalPath).toBe('docs/b.pdf.enc');
    const stored = adapter.files.get('docs/b.pdf.enc')!;
    expect(stored).not.toEqual(plaintext); // ciphertext must not equal the plaintext
  });

  it('round-trips correctly through write then read for both encrypted and plain files', async () => {
    const adapter = fakeAdapter();
    const plaintext = Buffer.from('round trip me');

    const plainPath = await writeMaybeEncrypted(adapter, 'docs/plain.pdf', plaintext, false);
    const encPath = await writeMaybeEncrypted(adapter, 'docs/enc.pdf', plaintext, true);

    expect(await readMaybeEncrypted(adapter, plainPath)).toEqual(plaintext);
    expect(await readMaybeEncrypted(adapter, encPath)).toEqual(plaintext);
  });

  it('does not attempt decryption for a path that does not end in .enc, even if it happens to contain ciphertext-looking bytes', async () => {
    const adapter = fakeAdapter();
    const raw = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    await adapter.write('docs/raw.pdf', raw);
    const result = await readMaybeEncrypted(adapter, 'docs/raw.pdf');
    expect(result).toEqual(raw);
  });
});
