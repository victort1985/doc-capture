import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly config: StorageConnectionConfig) {}

  private resolve(relativePath: string): string {
    return path.join(this.config.basePath, relativePath);
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
}
