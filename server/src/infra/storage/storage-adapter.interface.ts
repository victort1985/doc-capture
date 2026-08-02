import * as path from 'path';

export interface StorageAdapter {
  /** Write a buffer to the given relative path. Returns the final stored path. */
  write(relativePath: string, data: Buffer): Promise<string>;
  /** Read back the raw bytes at the given relative path. */
  read(relativePath: string): Promise<Buffer>;
  /** Rename/move a file or folder from one relative path to another. */
  rename(oldRelativePath: string, newRelativePath: string): Promise<void>;
  /** Check whether a file exists at the given relative path. */
  exists(relativePath: string): Promise<boolean>;
  /** Remove a file at the given relative path. */
  remove(relativePath: string): Promise<void>;
  /**
   * Verifies the connection actually works right now: for remote adapters,
   * a real auth+connect to the host (not just "is a file present" — a
   * connection can fail for reasons unrelated to any specific path, like
   * wrong credentials or an unreachable host). Used by the admin panel's
   * per-row "Test" button so a broken connection is caught before it's
   * relied on for a real upload.
   */
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export interface StorageConnectionConfig {
  type: 'local' | 'ftp' | 'sftp' | 'synology';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  basePath: string;
  extraConfig?: Record<string, unknown>;
}

/** Joins basePath + relativePath the same way every remote adapter
 * (FTP/SFTP/Synology) already did with a bare path.posix.join() call
 * repeated at every use site — except this version also verifies the
 * result actually stays inside basePath, which plain path.posix.join
 * never guarantees on its own (path.posix.join('/data', '../../etc')
 * happily resolves outside '/data'). A relativePath ultimately traces
 * back to something touching user input somewhere upstream (an
 * uploaded file's original filename, a document type, an id) in
 * every one of these adapters' callers — this is the one place that
 * closes that off for all of them, rather than trusting each call
 * site across the whole app to have already sanitized it correctly.
 * Mirrors LocalStorageAdapter's own resolve() (same reasoning, native
 * path.join instead of posix since local paths use the OS separator). */
export function safeRemoteJoin(basePath: string, relativePath: string): string {
  const base = path.posix.resolve(basePath);
  const target = path.posix.resolve(base, relativePath);
  if (target !== base && !target.startsWith(base + '/')) {
    throw new Error(`Refusing to access a path outside the storage root: ${relativePath}`);
  }
  return target;
}
