import { StorageAdapter, StorageConnectionConfig } from './storage-adapter.interface';
import { LocalStorageAdapter } from './local-storage.adapter';
import { FtpStorageAdapter } from './ftp-storage.adapter';
import { SftpStorageAdapter } from './sftp-storage.adapter';
import { SynologyStorageAdapter } from './synology-storage.adapter';

export function createStorageAdapter(config: StorageConnectionConfig): StorageAdapter {
  switch (config.type) {
    case 'local':
      return new LocalStorageAdapter(config);
    case 'ftp':
      return new FtpStorageAdapter(config);
    case 'sftp':
      return new SftpStorageAdapter(config);
    case 'synology':
      return new SynologyStorageAdapter(config);
    default:
      throw new Error(`Unsupported storage type: ${config.type}`);
  }
}
