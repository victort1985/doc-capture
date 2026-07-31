import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { encryptBuffer, decryptBuffer } from '../../common/crypto/encryption.util';

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * On-demand database backup, triggered from the admin panel rather
 * than only via the existing backup-all-tenants.sh cron script. Each
 * running instance is already scoped to exactly one tenant database
 * (DB_DATABASE in its own .env — this is a database-per-tenant
 * architecture, not row-level multi-tenancy within one shared DB), so
 * "back up this org" simply means "pg_dump whatever database this
 * process is connected to" — no organizationId parameter needed in
 * the dump itself.
 *
 * Uses the app's own username/password DB credentials (the same ones
 * TypeORM connects with) via PGPASSWORD, rather than the cron
 * script's `sudo -u postgres` — this runs inside the Node process,
 * which has no sudo access and shouldn't need any; the app's own DB
 * user already owns every table it would need to dump.
 *
 * Encrypted with the same AES-256-GCM key/functions every other
 * secret in this app uses (encryption.util.ts) — reusing the crypto
 * module directly rather than shelling out to openssl the way the
 * bash script does, since this runs in-process anyway.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  private get backupDir(): string {
    const base = process.env.BACKUP_DIR || '/opt/doc-capture/backups';
    const dbName = process.env.DB_DATABASE || 'doc_capture';
    return path.join(base, dbName);
  }

  async createNow(): Promise<BackupFileInfo> {
    await fsp.mkdir(this.backupDir, { recursive: true });

    const dump = await this.runPgDump();
    const gzipped = zlib.gzipSync(dump);
    const encrypted = encryptBuffer(gzipped);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${process.env.DB_DATABASE || 'db'}_${timestamp}.sql.gz.enc`;
    const filePath = path.join(this.backupDir, filename);
    await fsp.writeFile(filePath, encrypted);

    this.logger.log(`Created backup ${filename} (${(encrypted.length / 1024 / 1024).toFixed(1)} MB)`);

    const stat = await fsp.stat(filePath);
    return { filename, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() };
  }

  async list(): Promise<BackupFileInfo[]> {
    try {
      const files = await fsp.readdir(this.backupDir);
      const infos = await Promise.all(
        files
          .filter((f) => f.endsWith('.sql.gz.enc'))
          .map(async (f) => {
            const stat = await fsp.stat(path.join(this.backupDir, f));
            return { filename: f, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() };
          }),
      );
      return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []; // no backups yet — not an error
      throw err;
    }
  }

  /** Returns the DECRYPTED, gzipped SQL dump ready to stream to the
   * browser for download — decrypting server-side (rather than
   * handing back the raw .enc file) so "Save As" from the admin
   * panel produces an immediately-usable .sql.gz a person can
   * gunzip/restore without needing the server's ENCRYPTION_KEY
   * themselves. The file still sits encrypted at rest on disk the
   * whole time; only this specific authenticated download path ever
   * decrypts it, in memory, for the duration of the request. */
  async getDecryptedForDownload(filename: string): Promise<Buffer> {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Backup not found');
    const encrypted = await fsp.readFile(filePath);
    try {
      return decryptBuffer(encrypted);
    } catch {
      throw new InternalServerErrorException('Failed to decrypt this backup — the encryption key may have changed since it was created.');
    }
  }

  async delete(filename: string): Promise<void> {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Backup not found');
    await fsp.unlink(filePath);
  }

  /** Filenames are only ever ones this service itself generated, but
   * validate anyway since the value arrives from a URL param — this
   * is the one thing standing between "read a file in the backup
   * dir" and "read any file the process can access" if that
   * assumption is ever wrong. */
  private assertSafeFilename(filename: string): void {
    if (!/^[\w.-]+\.sql\.gz\.enc$/.test(filename)) {
      throw new BadRequestException('Invalid backup filename');
    }
  }

  private runPgDump(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const args = [
        '-h', process.env.DB_HOST || 'localhost',
        '-p', process.env.DB_PORT || '5432',
        '-U', process.env.DB_USERNAME || 'postgres',
        process.env.DB_DATABASE || 'doc_capture',
      ];
      const child = spawn('pg_dump', args, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
      });

      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (err) => reject(new InternalServerErrorException(`pg_dump could not start — is it installed? (${err.message})`)));
      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`pg_dump exited with code ${code}: ${stderr}`);
          reject(new InternalServerErrorException('pg_dump failed — see server logs for details'));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }
}
