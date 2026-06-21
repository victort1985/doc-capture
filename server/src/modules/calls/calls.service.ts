import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ServiceCall, CallStatus } from './entities/service-call.entity';
import { CallNote } from './entities/call-note.entity';
import { CallAttachment } from './entities/call-attachment.entity';
import { CallWorkingSession } from './entities/call-working-session.entity';
import { CreateCallDto } from './dto/create-call.dto';
import { UpdateCallDto } from './dto/update-call.dto';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { processDocument } from '../files/processors/document.processor';
import { processPhoto } from '../files/processors/photo.processor';
import { encryptBuffer, decryptBuffer } from '../../common/crypto/encryption.util';
import { sanitize } from '../templates/name-pattern.util';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { LocationsService } from '../locations/locations.service';

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
    @InjectRepository(CallNote) private readonly notesRepo: Repository<CallNote>,
    @InjectRepository(CallAttachment) private readonly attachmentsRepo: Repository<CallAttachment>,
    @InjectRepository(CallWorkingSession) private readonly workingSessionsRepo: Repository<CallWorkingSession>,
    private readonly storageService: StorageService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsGateway,
    private readonly locationsService: LocationsService,
  ) {}

  async create(userId: number, organizationId: number | null, dto: CreateCallDto): Promise<ServiceCall> {
    // When a Location was picked from the directory, trust its name over
    // whatever free-text the client also sent for `place` — keeps the two
    // in sync rather than risking them drifting apart.
    let place = dto.place;
    let location: { id: number } | undefined;
    if (dto.locationId) {
      const found = await this.locationsService.findLocationById(dto.locationId, organizationId);
      place = found.name;
      location = { id: found.id };
    }

    let call = this.callsRepo.create({
      place,
      location: location as any,
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
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    });
    call = await this.callsRepo.save(call);

    // Folder name needs the call's own id, so it's computed once we have
    // one, then saved back — see finalizeFolderOnClose() for the rename
    // that happens when the call is closed.
    const date = call.createdAt.toISOString().slice(0, 10);
    call.storageFolderName = `calls/${call.id}_${date}_${sanitize(place)}`;
    call = await this.callsRepo.save(call);

    const full = await this.findOne(call.id);

    // Route the "new call" notification: technicians covering the call's
    // region within the SAME organization as the call, plus anyone
    // global in that organization. If the call has no resolvable region
    // (free-text place not yet in the directory), fall back to notifying
    // everyone in the call's organization rather than silently notifying
    // no one — but never across organizations, even as a fallback.
    const regionId = full.location?.city?.region?.id;
    const orgId = full.organization?.id ?? null;
    const targetUsers = regionId
      ? await this.usersService.findUsersForRegion(regionId, orgId)
      : await this.usersService.findAll({ organizationId: orgId });
    this.notifications.broadcastCallCreated(full, targetUsers.map((u) => u.id));

    return full;
  }

  /**
   * Super-admin (organizationId null) sees every call. An org-scoped
   * user sees their own organization's calls PLUS any call with no
   * organization at all — those predate multi-tenancy and are treated
   * as shared/global rather than invisible to everyone but the
   * super-admin (same reasoning as Location — see
   * LocationsService.findLocations).
   */
  findAll(requester?: { organizationId: number | null }): Promise<ServiceCall[]> {
    return this.callsRepo.find({
      relations: ['createdBy', 'statusChangedBy', 'closedBy', 'location', 'location.city', 'location.city.region', 'workingSessions', 'workingSessions.user', 'organization'],
      where:
        requester?.organizationId != null
          ? [{ organization: { id: requester.organizationId } }, { organization: IsNull() }]
          : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ServiceCall> {
    const call = await this.callsRepo.findOne({
      where: { id },
      relations: ['createdBy', 'statusChangedBy', 'closedBy', 'location', 'location.city', 'location.city.region', 'workingSessions', 'workingSessions.user', 'organization'],
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  /** Admin-only (enforced at the controller). Cascades to notes/attachments/working sessions via DB FK — doesn't remove the underlying files from storage, just the database records and history. */
  async remove(id: number): Promise<void> {
    const call = await this.findOne(id);
    await this.callsRepo.remove(call);
  }

  /** Admin-only general edit (enforced at the controller) — corrects place/contact/urgency/description directly, distinct from the normal open/in-progress/closed status flow any user can trigger via updateStatus. */
  async update(id: number, dto: UpdateCallDto): Promise<ServiceCall> {
    const call = await this.findOne(id);
    let place = dto.place ?? call.place;
    let location = call.location;
    if (dto.locationId !== undefined) {
      if (dto.locationId) {
        const found = await this.locationsService.findLocationById(dto.locationId);
        place = found.name;
        location = found;
      } else {
        location = undefined as any;
      }
    }
    Object.assign(call, {
      place,
      location,
      latitude: dto.latitude ?? call.latitude,
      longitude: dto.longitude ?? call.longitude,
      urgency: dto.urgency ?? call.urgency,
      contactName: dto.contactName ?? call.contactName,
      contactPosition: dto.contactPosition ?? call.contactPosition,
      contactPhone: dto.contactPhone ?? call.contactPhone,
      description: dto.description ?? call.description,
      unusualDamage: dto.unusualDamage ?? call.unusualDamage,
    });
    await this.callsRepo.save(call);
    return this.findOne(id);
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

  /** Streams a note's photo back (spec item 1: view already-added photos on an open call). */
  async downloadNotePhoto(noteId: number): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
    const note = await this.notesRepo.findOne({
      where: { id: noteId },
      relations: ['photoStorageConnection'],
    });
    if (!note?.photoRelativePath || !note.photoStorageConnection) {
      throw new NotFoundException('This note has no photo');
    }
    const adapter = await this.storageService.getAdapter(note.photoStorageConnection.id);
    let bytes = await adapter.read(note.photoRelativePath);
    if (note.photoEncrypted) bytes = decryptBuffer(bytes);
    return { buffer: bytes, filename: note.photoGeneratedName || 'photo.jpg', mimetype: 'image/jpeg' };
  }

  /** Streams an attachment's file back (spec item 1: view already-added documents on an open call). */
  async downloadAttachment(attachmentId: number): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
    const attachment = await this.attachmentsRepo.findOne({
      where: { id: attachmentId },
      relations: ['storageConnection'],
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (!attachment.relativePath || !attachment.storageConnection) {
      throw new BadRequestException('This attachment has no recorded storage path and can no longer be read back.');
    }
    const adapter = await this.storageService.getAdapter(attachment.storageConnection.id);
    let bytes = await adapter.read(attachment.relativePath);
    if (attachment.encrypted) bytes = decryptBuffer(bytes);
    return { buffer: bytes, filename: attachment.originalName, mimetype: 'application/pdf' };
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

    if (status === CallStatus.IN_PROGRESS) {
      // Each user who presses "In progress" gets their own timer (spec
      // item 8) — but pressing it again while already active for this
      // same user shouldn't start a second concurrent one for them.
      const alreadyActive = await this.workingSessionsRepo.findOne({
        where: { call: { id: callId }, user: { id: userId }, endedAt: IsNull() },
      });
      if (!alreadyActive) {
        const user = await this.usersService.findById(userId);
        await this.workingSessionsRepo.save(
          this.workingSessionsRepo.create({
            call: { id: callId } as any,
            user: { id: userId } as any,
            userName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
            startedAt: new Date(),
          }),
        );
      }
    }

    if (status === CallStatus.CLOSED && !call.storageFolderFinalized) {
      call.closedBy = { id: userId } as any;
      folderRenameWarning = await this.finalizeFolderOnClose(call, userId);
    }

    if (status === CallStatus.CLOSED) {
      // Stop every still-running timer, not just the closing user's own —
      // anyone else who pressed "In progress" and never closed it out
      // themselves still gets their elapsed time finalized here.
      await this.workingSessionsRepo.update(
        { call: { id: callId }, endedAt: IsNull() },
        { endedAt: new Date() },
      );
    }

    const saved = await this.callsRepo.save(call);
    const full = await this.findOne(saved.id);
    this.notifications.broadcastStatusChanged(full, previousStatus);
    return { call: full, folderRenameWarning };
  }

  findWorkingSessions(callId: number): Promise<CallWorkingSession[]> {
    return this.workingSessionsRepo.find({
      where: { call: { id: callId } },
      order: { startedAt: 'ASC' },
    });
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
