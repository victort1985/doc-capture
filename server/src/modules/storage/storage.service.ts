import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageConnection } from './entities/storage-connection.entity';
import { ClientStorageSettings } from './entities/client-storage-settings.entity';
import { CreateStorageConnectionDto } from './dto/create-storage-connection.dto';
import { UpdateStorageConnectionDto } from './dto/update-storage-connection.dto';
import { UpdateClientStorageSettingsDto } from './dto/update-client-storage-settings.dto';
import { createStorageAdapter } from '../../infra/storage/storage-adapter.factory';
import { StorageAdapter } from '../../infra/storage/storage-adapter.interface';

type PublicConnection = Omit<StorageConnection, 'password'>;

@Injectable()
export class StorageService {
  constructor(
    @InjectRepository(StorageConnection)
    private readonly connectionsRepo: Repository<StorageConnection>,
    @InjectRepository(ClientStorageSettings)
    private readonly settingsRepo: Repository<ClientStorageSettings>,
  ) {}

  // ---- Connections (admin) ----
  // `password` is never returned from any of these public-facing methods —
  // it's encrypted at rest (see the entity) and excluded by `select: false`
  // by default; toPublic() additionally strips it from in-memory objects
  // returned by create/update (save() returns what you passed in, which
  // still has the plaintext value attached even though select:false keeps
  // it out of fresh queries).

  async findAllConnections(): Promise<PublicConnection[]> {
    const conns = await this.connectionsRepo.find();
    return conns.map((c) => this.toPublic(c));
  }

  async findConnection(id: number): Promise<PublicConnection> {
    const conn = await this.findConnectionEntity(id);
    return this.toPublic(conn);
  }

  async createConnection(dto: CreateStorageConnectionDto): Promise<PublicConnection> {
    const saved = await this.connectionsRepo.save(this.connectionsRepo.create(dto));
    return this.toPublic(saved);
  }

  async updateConnection(
    id: number,
    dto: UpdateStorageConnectionDto,
  ): Promise<PublicConnection> {
    // Fetched WITH the secret so that an omitted/blank password in the
    // patch body preserves whatever's already stored, instead of wiping
    // it — the admin panel relies on this (edit name/host without having
    // to re-type credentials every time).
    const conn = await this.findConnectionWithSecret(id);
    Object.assign(conn, dto);
    const saved = await this.connectionsRepo.save(conn);
    return this.toPublic(saved);
  }

  async removeConnection(id: number): Promise<void> {
    const conn = await this.findConnectionEntity(id);
    await this.connectionsRepo.remove(conn);
  }

  /** Resolve a usable adapter instance for a given connection. */
  async getAdapter(connectionId: number): Promise<StorageAdapter> {
    const conn = await this.findConnectionWithSecret(connectionId);
    return createStorageAdapter({
      type: conn.type,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      basePath: conn.basePath,
      extraConfig: conn.extraConfig,
    });
  }

  /** Same as getAdapter(), plus the connection's encryptAtRest preference, in a single lookup. */
  async getAdapterWithMeta(
    connectionId: number,
  ): Promise<{ adapter: StorageAdapter; encryptAtRest: boolean }> {
    const conn = await this.findConnectionWithSecret(connectionId);
    const adapter = createStorageAdapter({
      type: conn.type,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      basePath: conn.basePath,
      extraConfig: conn.extraConfig,
    });
    return { adapter, encryptAtRest: Boolean(conn.extraConfig?.encryptAtRest) };
  }

  private async findConnectionEntity(id: number): Promise<StorageConnection> {
    const conn = await this.connectionsRepo.findOne({ where: { id } });
    if (!conn) throw new NotFoundException('Storage connection not found');
    return conn;
  }

  /** Internal-only: explicitly selects the encrypted password column. Never expose the return value of this directly via an API response. */
  private async findConnectionWithSecret(id: number): Promise<StorageConnection> {
    const conn = await this.connectionsRepo.findOne({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        username: true,
        password: true,
        basePath: true,
        extraConfig: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!conn) throw new NotFoundException('Storage connection not found');
    return conn;
  }

  private toPublic(conn: StorageConnection): PublicConnection {
    const { password, ...rest } = conn;
    return rest;
  }

  // ---- Client settings (admin) ----

  async getClientSettings(userId: number): Promise<ClientStorageSettings | null> {
    return this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'documentStorageConnection', 'photoStorageConnection'],
    });
  }

  async updateClientSettings(
    userId: number,
    dto: UpdateClientStorageSettingsDto,
  ): Promise<ClientStorageSettings> {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      settings = this.settingsRepo.create({ user: { id: userId } as any });
    }

    if (dto.documentStorageConnectionId !== undefined) {
      settings.documentStorageConnection = { id: dto.documentStorageConnectionId } as any;
    }
    if (dto.photoStorageConnectionId !== undefined) {
      settings.photoStorageConnection = { id: dto.photoStorageConnectionId } as any;
    }
    if (dto.documentSubfolderPattern !== undefined) {
      settings.documentSubfolderPattern = dto.documentSubfolderPattern;
    }
    if (dto.photoSubfolderPattern !== undefined) {
      settings.photoSubfolderPattern = dto.photoSubfolderPattern;
    }

    return this.settingsRepo.save(settings);
  }
}
