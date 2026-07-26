import { StorageAdapter } from '../../infra/storage/storage-adapter.interface';
import { encryptBuffer, decryptBuffer } from './encryption.util';

/**
 * Thin wrapper around the existing encryptAtRest convention (see
 * calls.service.ts/files.service.ts for the original pattern this
 * mirrors) for document types that don't need their own dedicated
 * "encrypted" boolean column: the ".enc" filename suffix alone is
 * the source of truth for whether a given stored file needs
 * decrypting on read, since these document PDFs are always named by
 * this code (never by a person, unlike an uploaded photo), so the
 * suffix is guaranteed present whenever encryption was actually
 * applied at write time.
 */
export async function writeMaybeEncrypted(
  adapter: StorageAdapter,
  relativePath: string,
  data: Buffer,
  encryptAtRest: boolean,
): Promise<string> {
  const finalPath = encryptAtRest ? `${relativePath}.enc` : relativePath;
  await adapter.write(finalPath, encryptAtRest ? encryptBuffer(data) : data);
  return finalPath;
}

export async function readMaybeEncrypted(adapter: StorageAdapter, storedPath: string): Promise<Buffer> {
  const bytes = await adapter.read(storedPath);
  return storedPath.endsWith('.enc') ? decryptBuffer(bytes) : bytes;
}
