import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCall, CallStatus } from './entities/service-call.entity';
import { CallNote } from './entities/call-note.entity';
import { CallAttachment } from './entities/call-attachment.entity';
import { CreateCallDto } from './dto/create-call.dto';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { processDocument } from '../files/processors/document.processor';
import { processPhoto } from '../files/processors/photo.processor';
import { encryptBuffer } from '../../common/crypto/encryption.util';
import { sanitize } from '../templates/name-pattern.util';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
    @InjectRepository(CallNote) private readonly notesRepo: Repository<CallNote>,
    @InjectRepository(CallAttachment) private readonly attachmentsRepo: Repository<CallAttachment>,
    private readonly storageService: StorageService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsGateway,
  ) {}

  async create(userId: number, dto: CreateCallDto): Promise<ServiceCall> {
    let call = this.callsRepo.create({
      place: dto.place,
      latitude: dto.latitude,
      longitude: dto.longitude,
      urgency: dto.urgency,
      contactName: dto.contactName,
      contactPosition: dto.contactPosition,
      contactPhone: dto.contactPhone,
      description: dto.description,
      unusualDamage: dto.unusualDamage ?? false,
      status: CallStatus.OPEN,
      createdBy: { id: userId } as any,
    });
    call = await this.callsRepo.save(call);

    // Folder name needs the call's own id, so it's computed once we have
    // one, then saved back — see finalizeFolderOnClose() for the rename
    // that happens when the call is closed.
    const date = call.createdAt.toISOString().slice(0, 10);
    call.storageFolderName = `calls/${call.id}_${date}_${sanitize(dto.place)}`;
    call = await this.callsRepo.save(call);

    const full = await this.findOne(call.id);
    this.notifications.broadcastCallCreated(full);
    return full;
  }

  findAll(): Promise<ServiceCall[]> {
    // Deliberately not scoped per-user — this is a shared team inbox any
    // authenticated user can see and pick up, per spec ("when one of the
    // users selects a call").
    return this.callsRepo.find({
      relations: ['createdBy', 'statusChangedBy', 'closedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ServiceCall> {
    const call = await this.callsRepo.findOne({
      where: { id },
      relations: ['createdBy', 'statusChangedBy', 'closedBy'],
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  findNotes(callId: number): Promise<CallNote[]> {
    return this.notesRepo.find({
      where: { call: { id: callId } },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
  }

  findAttachments(callId: number): Promise<CallAttachment[]> {
    return this.attachmentsRepo.find({
      where: { call: { id: callId } },
      relations: ['uploadedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  async updateStatus(
    callId: number,
    userId: number,
    status: CallStatus,
  ): Promise<{ call: ServiceCall; folderRenameWarning?: string }> {
    const call = await this.findOne(callId);
    const previousStatus = call.status;
    call.status = status;
    call.statusChangedBy = { id: userId } as any;
    call.statusChangedAt = new Date();

    let folderRenameWarning: string | undefined;

    if (status === CallStatus.CLOSED && !call.storageFolderFinalized) {
      call.closedBy = { id: userId } as any;
      folderRenameWarning = await this.finalizeFolderOnClose(call, userId);
    }

    const saved = await this.callsRepo.save(call);
    const full = await this.findOne(saved.id);
    this.notifications.broadcastStatusChanged(full, previousStatus);
    return { call: full, folderRenameWarning };
  }

  /**
   * Appends the closing user's username to the call's storage folder name
   * across every distinct storage connection currently holding files for
   * this call (normally just one, but routing could have changed mid-call).
   * Best-effort: a rename failure on one connection (e.g. it's no longer
   * reachable) is reported back as a warning rather than blocking the
   * status change itself — the call still needs to close either way.
   */
  private async finalizeFolderOnClose(call: ServiceCall, closedByUserId: number): Promise<string | undefined> {
    const oldFolder = call.storageFolderName;
    if (!oldFolder) return undefined;

    const closer = await this.usersService.findById(closedByUserId);
    const newFolder = `${oldFolder}_${sanitize(closer.username)}`;

    const [attachments, notes] = await Promise.all([
      this.attachmentsRepo.find({ where: { call: { id: call.id } }, relations: ['storageConnection'] }),
      this.notesRepo.find({ where: { call: { id: call.id } }, relations: ['photoStorageConnection'] }),
    ]);
    const connectionIds = new Set<number>();
    for (const a of attachments) if (a.storageConnection) connectionIds.add(a.storageConnection.id);
    for (const n of notes) if (n.photoStorageConnection) connectionIds.add(n.photoStorageConnection.id);

    const failures: string[] = [];
    for (const connectionId of connectionIds) {
      try {
        const adapter = await this.storageService.getAdapter(connectionId);
        await adapter.rename(oldFolder, newFolder);
      } catch (err) {
        failures.push(`connection #${connectionId}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    call.storageFolderName = newFolder;
    call.storageFolderFinalized = true;

    return failures.length
      ? `Status updated, but the storage folder could not be renamed on: ${failures.join('; ')}`
      : undefined;
  }

  async addNote(
    callId: number,
    userId: number,
    text: string | undefined,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<CallNote> {
    const call = await this.findOne(callId);
    const note = this.notesRepo.create({
      call: { id: callId } as any,
      author: { id: userId } as any,
      text,
    });

    if (photo) {
      const settings = await this.storageService.getClientSettings(userId);
      const connectionId = settings?.photoStorageConnection?.id;
      if (connectionId) {
        const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
        const processed = await processPhoto(photo.buffer);
        const toWrite = encryptAtRest ? encryptBuffer(processed) : processed;
        const generatedName = `note_${Date.now()}.jpg${encryptAtRest ? '.enc' : ''}`;
        const relativePath = `${call.storageFolderName}/notes/${generatedName}`;
        await adapter.write(relativePath, toWrite);
        note.photoGeneratedName = generatedName;
        note.photoRelativePath = relativePath;
        note.photoStorageConnection = { id: connectionId } as any;
        note.photoEncrypted = encryptAtRest;
      }
    }

    const saved = await this.notesRepo.save(note);
    const full = await this.notesRepo.findOne({ where: { id: saved.id }, relations: ['author'] });
    this.notifications.broadcastNoteAdded(call, full!);
    return full!;
  }

  async addAttachment(
    callId: number,
    userId: number,
    file: { originalname: string; buffer: Buffer; mimetype: string },
  ): Promise<CallAttachment> {
    const call = await this.findOne(callId);
    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) {
      throw new NotFoundException(
        'No document storage connection configured for this user. Ask an admin to set it up under Storage routing.',
      );
    }

    const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
    const processed = await processDocument(file.buffer);
    const toWrite = encryptAtRest ? encryptBuffer(processed) : processed;
    const generatedName = `attachment_${Date.now()}.pdf${encryptAtRest ? '.enc' : ''}`;
    const relativePath = `${call.storageFolderName}/files/${generatedName}`;
    const finalPath = await adapter.write(relativePath, toWrite);

    const attachment = this.attachmentsRepo.create({
      call: { id: callId } as any,
      uploadedBy: { id: userId } as any,
      originalName: file.originalname,
      generatedName,
      path: finalPath,
      relativePath,
      storageConnection: { id: connectionId } as any,
      encrypted: encryptAtRest,
    });
    const saved = await this.attachmentsRepo.save(attachment);
    const full = await this.attachmentsRepo.findOne({ where: { id: saved.id }, relations: ['uploadedBy'] });
    this.notifications.broadcastAttachmentAdded(call, full!);
    return full!;
  }
}
