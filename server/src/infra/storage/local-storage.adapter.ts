import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly config: StorageConnectionConfig) {}

  /** Resolves a relative path against basePath AND verifies the
   * result actually stays inside it — path.join() alone does NOT do
   * this (path.join('/data', '../../etc/passwd') happily resolves
   * outside '/data'). Every relativePath this adapter ever receives
   * is ultimately built from something that touches user input
   * somewhere upstream (an uploaded file's original filename, a
   * document type, an id) — this containment check is the one place
   * that protects every single caller (invoices, quotes, expenses,
   * delivery notes, payments, etc.) at once, rather than trusting
   * each of them to have sanitized their own relativePath correctly.
   * A real, exploitable arbitrary-file-write path was found and
   * fixed this way rather than only patching the one call site it
   * was found through. */
  private resolve(relativePath: string): string {
    const base = path.resolve(this.config.basePath);
    const target = path.resolve(base, relativePath);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error(`Refusing to access a path outside the storage root: ${relativePath}`);
    }
    return target;
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return fullPath;
  }

  async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const newFull = this.resolve(newRelativePath);
    await fs.mkdir(path.dirname(newFull), { recursive: true });
    await fs.rename(this.resolve(oldRelativePath), newFull);
  }

  async read(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async remove(relativePath: string): Promise<void> {
    await fs.rm(this.resolve(relativePath), { force: true });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
      await fs.access(this.config.basePath, fs.constants.W_OK);
      return { ok: true, message: `Writable: ${this.config.basePath}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
