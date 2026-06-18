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
}

export interface StorageConnectionConfig {
  type: 'local' | 'ftp' | 'synology';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  basePath: string;
  extraConfig?: Record<string, unknown>;
}
