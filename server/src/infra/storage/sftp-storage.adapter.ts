import SftpClient from 'ssh2-sftp-client';
import * as path from 'path';
import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';
import { withTimeout } from './with-timeout.util';

const SFTP_TIMEOUT_MS = parseInt(process.env.STORAGE_OPERATION_TIMEOUT_MS || '15000', 10);

/**
 * Real SFTP (SSH File Transfer Protocol) support — distinct from the
 * existing FtpStorageAdapter, which speaks plain FTP. The two protocols
 * share a similar name but are not interchangeable: an FTP client cannot
 * talk to an SFTP (SSH-based) server and vice versa, confirmed via a
 * real connection test that correctly timed out when an 'ftp'-typed
 * connection was pointed at an actual SFTP server.
 *
 * Auth: supports password auth via config.password, and optionally a
 * private key via config.extraConfig.privateKey (PEM string) +
 * config.extraConfig.passphrase, for setups that use key-based SSH auth
 * instead of (or in addition to) a password.
 */
export class SftpStorageAdapter implements StorageAdapter {
  constructor(private readonly config: StorageConnectionConfig) {}

  private async withClient<T>(fn: (client: SftpClient) => Promise<T>): Promise<T> {
    const client = new SftpClient();
    try {
      await client.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.extraConfig?.privateKey as string | undefined,
        passphrase: this.config.extraConfig?.passphrase as string | undefined,
        readyTimeout: SFTP_TIMEOUT_MS,
      });
      return await fn(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => {
        const dir = path.posix.dirname(remotePath);
        if (!(await client.exists(dir))) {
          await client.mkdir(dir, true);
        }
        await client.put(data, remotePath);
        return remotePath;
      }),
      `SFTP write to ${this.config.host}`,
    );
  }

  async read(relativePath: string): Promise<Buffer> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => {
        const result = await client.get(remotePath);
        return Buffer.isBuffer(result) ? result : Buffer.from(result as string);
      }),
      `SFTP read from ${this.config.host}`,
    );
  }

  async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const oldRemote = path.posix.join(this.config.basePath, oldRelativePath);
    const newRemote = path.posix.join(this.config.basePath, newRelativePath);
    return withTimeout(
      this.withClient(async (client) => {
        await client.rename(oldRemote, newRemote);
      }),
      `SFTP rename on ${this.config.host}`,
    );
  }

  async exists(relativePath: string): Promise<boolean> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => Boolean(await client.exists(remotePath))),
      `SFTP exists-check on ${this.config.host}`,
    );
  }

  async remove(relativePath: string): Promise<void> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    await withTimeout(
      this.withClient(async (client) => {
        await client.delete(remotePath).catch(() => undefined);
      }),
      `SFTP remove on ${this.config.host}`,
    );
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await withTimeout(
        this.withClient(async (client) => {
          await client.stat(this.config.basePath);
        }),
        `SFTP test-connection to ${this.config.host}`,
      );
      return { ok: true, message: `Connected to ${this.config.host}:${this.config.port || 22}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
