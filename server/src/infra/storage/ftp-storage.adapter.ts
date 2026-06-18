import { Client } from 'basic-ftp';
import { Readable, Writable } from 'stream';
import * as path from 'path';
import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';
import { withTimeout } from './with-timeout.util';

const FTP_TIMEOUT_MS = parseInt(process.env.STORAGE_OPERATION_TIMEOUT_MS || '15000', 10);

export class FtpStorageAdapter implements StorageAdapter {
  constructor(private readonly config: StorageConnectionConfig) {}

  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    // basic-ftp's Client constructor timeout applies to control-socket idle
    // time (connect, and gaps between commands) — this is the "real" timeout
    // at the protocol level, on top of the generic withTimeout() wrapper
    // below which guards the overall call from the caller's perspective.
    const client = new Client(FTP_TIMEOUT_MS);
    try {
      await client.access({
        host: this.config.host,
        port: this.config.port || 21,
        user: this.config.username,
        password: this.config.password,
        secure: Boolean(this.config.extraConfig?.secure),
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => {
        await client.ensureDir(path.posix.dirname(remotePath));
        await client.uploadFrom(Readable.from(data), path.posix.basename(remotePath));
        return remotePath;
      }),
      `FTP write to ${this.config.host}`,
    );
  }

  async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const oldRemote = path.posix.join(this.config.basePath, oldRelativePath);
    const newRemote = path.posix.join(this.config.basePath, newRelativePath);
    return withTimeout(
      this.withClient(async (client) => {
        await client.rename(oldRemote, newRemote);
      }),
      `FTP rename on ${this.config.host}`,
    );
  }

  async read(relativePath: string): Promise<Buffer> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => {
        const chunks: Buffer[] = [];
        const sink = new Writable({
          write(chunk, _enc, cb) {
            chunks.push(chunk);
            cb();
          },
        });
        await client.downloadTo(sink, remotePath);
        return Buffer.concat(chunks);
      }),
      `FTP read from ${this.config.host}`,
    );
  }

  async exists(relativePath: string): Promise<boolean> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    return withTimeout(
      this.withClient(async (client) => {
        try {
          await client.size(remotePath);
          return true;
        } catch {
          return false;
        }
      }),
      `FTP exists-check on ${this.config.host}`,
    );
  }

  async remove(relativePath: string): Promise<void> {
    const remotePath = path.posix.join(this.config.basePath, relativePath);
    await withTimeout(
      this.withClient(async (client) => {
        await client.remove(remotePath).catch(() => undefined);
      }),
      `FTP remove on ${this.config.host}`,
    );
  }
}
