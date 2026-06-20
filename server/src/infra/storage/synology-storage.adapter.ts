import { createClient, WebDAVClient } from 'webdav';
import * as path from 'path';
import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';
import { withTimeout } from './with-timeout.util';

/**
 * Synology NAS via WebDAV (File Station WebDAV server must be enabled).
 * If SMB/FTP is preferred instead, swap this adapter for FtpStorageAdapter
 * or add an SMB-based implementation behind the same interface.
 */
export class SynologyStorageAdapter implements StorageAdapter {
  private client: WebDAVClient;

  constructor(private readonly config: StorageConnectionConfig) {
    const protocol = (config.extraConfig?.secure as boolean) ? 'https' : 'http';
    this.client = createClient(`${protocol}://${config.host}:${config.port}`, {
      username: config.username,
      password: config.password,
    });
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      (async () => {
        await this.ensureDir(path.posix.dirname(remotePath));
        await this.client.putFileContents(remotePath, data, { overwrite: true });
        return remotePath;
      })(),
      `WebDAV write to ${this.config.host}`,
    );
  }

  async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const oldRemote = path.posix.join(this.config.basePath, oldRelativePath);
    const newRemote = path.posix.join(this.config.basePath, newRelativePath);
    await withTimeout(this.client.moveFile(oldRemote, newRemote), `WebDAV rename on ${this.config.host}`);
  }

  async read(relativePath: string): Promise<Buffer> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    const content = await withTimeout(
      this.client.getFileContents(remotePath) as Promise<Buffer>,
      `WebDAV read from ${this.config.host}`,
    );
    return Buffer.from(content);
  }

  async exists(relativePath: string): Promise<boolean> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(this.client.exists(remotePath), `WebDAV exists-check on ${this.config.host}`);
  }

  async remove(relativePath: string): Promise<void> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    await withTimeout(
      (async () => {
        if (await this.client.exists(remotePath)) {
          await this.client.deleteFile(remotePath);
        }
      })(),
      `WebDAV remove on ${this.config.host}`,
    );
  }

  private async ensureDir(dirPath: string): Promise<void> {
    const segments = dirPath.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current += `/${segment}`;
      if (!(await this.client.exists(current))) {
        await this.client.createDirectory(current);
      }
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await withTimeout(this.ensureDir(this.config.basePath), `WebDAV test-connection to ${this.config.host}`);
      return { ok: true, message: `Connected to ${this.config.host}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
