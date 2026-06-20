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
