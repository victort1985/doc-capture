import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeliveryNote, DeliveryNoteStatus, NoteItem } from './delivery-note.entity';
import { DeliveryNoteSettings } from './delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DeliveryNotesService {
  constructor(
    @InjectRepository(DeliveryNote) private readonly repo: Repository<DeliveryNote>,
    @InjectRepository(DeliveryNoteSettings) private readonly settingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  findAll(organizationId: number | null): Promise<DeliveryNote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      relations: ['createdBy', 'organization'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<DeliveryNote> {
    const note = await this.repo.findOne({ where: { id }, relations: ['organization', 'createdBy'] });
    if (!note) throw new NotFoundException('Note not found');
    if (organizationId != null && note.organization?.id !== organizationId) throw new NotFoundException('Note not found');
    return note;
  }

  async create(organizationId: number | null, userId: number, dto: Partial<DeliveryNote>): Promise<DeliveryNote> {
    const count = await this.repo.count({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    const orgSettings = organizationId
      ? await this.settingsRepo.findOne({ where: { organization: { id: organizationId } } })
      : null;
    const startNum = orgSettings?.startingNumber ?? 10000;
    const prefix = orgSettings?.notePrefix ?? '';
    const noteNumber = dto.noteNumber ?? `${prefix}${startNum + count}`;
    const note = this.repo.create({
      ...dto,
      noteNumber,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      items: dto.items ?? [],
      chainId: dto.chainId || crypto.randomUUID(),
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    return this.repo.save(note);
  }

  async update(id: number, organizationId: number | null, dto: Partial<DeliveryNote>): Promise<DeliveryNote> {
    const note = await this.findOne(id, organizationId);
    Object.assign(note, dto);
    return this.repo.save(note);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const note = await this.findOne(id, organizationId);
    await this.repo.remove(note);
  }

  // ── Smart autocomplete ────────────────────────────────────────────────────

  /** Returns unique client names matching the query (from previous notes). */
  async autocompleteClients(q: string, organizationId: number | null): Promise<string[]> {
    const where = organizationId != null
      ? [{ clientName: ILike(`%${q}%`), organization: { id: organizationId } }]
      : [{ clientName: ILike(`%${q}%`) }];
    const rows = await this.repo.find({ where, select: ['clientName'], take: 10 });
    return [...new Set(rows.map(r => r.clientName).filter(Boolean) as string[])];
  }

  /** Returns unique values of any text field (deliveredTo, recipientRole, etc.) */
  async autocompleteField(field: string, q: string, organizationId: number | null): Promise<string[]> {
    const allowed = ['deliveredTo', 'recipientRole', 'clientAddress', 'lesseeIdNumber'];
    if (!allowed.includes(field)) return [];
    const rows = await this.repo
      .createQueryBuilder('n')
      .select(`DISTINCT n."${field}"`, 'val')
      .where(`n."${field}" ILIKE :q`, { q: `%${q}%` })
      .andWhere(organizationId != null ? 'n."organizationId" = :orgId' : '1=1', { orgId: organizationId })
      .limit(8)
      .getRawMany();
    return rows.map(r => r.val).filter(Boolean);
  }

  // ── PDF + storage ─────────────────────────────────────────────────────────

  async storePdf(id: number, organizationId: number | null, userId: number, pdfBuffer: Buffer): Promise<string> {
    const note = await this.findOne(id, organizationId);
    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new NotFoundException('Storage not configured');

    // delivery-notes/{clientSlug}/note_{noteNumber}.pdf
    const slug = (note.clientName ?? 'unknown').replace(/[^a-zA-Z0-9א-ת\-_]/g, '_').slice(0, 40);
    const path = `delivery-notes/${slug}/note_${note.noteNumber ?? id}.pdf`;

    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);
    await adapter.write(path, pdfBuffer);
    note.pdfPath = path;
    note.status = DeliveryNoteStatus.SIGNED;
    await this.repo.save(note);
    return path;
  }

  async downloadPdf(id: number, organizationId: number | null): Promise<{ buffer: Buffer; filename: string }> {
    const note = await this.findOne(id, organizationId);
    if (!note.pdfPath) throw new NotFoundException('PDF not generated yet');
    const settings = await this.storageService.getClientSettings(0);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new NotFoundException('Storage not configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);
    const buffer = await adapter.read(note.pdfPath);
    return { buffer, filename: `note_${note.noteNumber}.pdf` };
  }

  // ── Remote signing ────────────────────────────────────────────────────────

  async createSigningLink(id: number, organizationId: number | null): Promise<{ token: string; url: string }> {
    const note = await this.repo.findOne({ where: { id } });
    if (!note) throw new NotFoundException('Note not found');
    if (!note.signingToken) {
      note.signingToken = require('crypto').randomBytes(24).toString('hex');
      await this.repo.save(note);
    }
    const url = `${process.env.SIGN_BASE_URL || "https://sign.doc-capture.app"}/${note.signingToken}`;
    return { token: note.signingToken!, url };
  }

  async getNoteForSigning(token: string) {
    const note = await this.repo.findOne({
      where: { signingToken: token },
      relations: ['organization'],
    });
    if (!note) throw new NotFoundException('Link not found or expired');
    if (note.status === 'signed') return { alreadySigned: true, signedAt: note.lesseeSignedAt };

    // Load org settings for company info on the signing page
    const orgSettings = note.organization?.id
      ? await this.settingsRepo.findOne({ where: { organization: { id: note.organization.id } } })
      : null;

    return {
      alreadySigned: false,
      noteNumber: note.noteNumber,
      documentType: note.documentType,
      date: note.date,
      clientName: note.clientName,
      clientAddress: note.clientAddress,
      items: note.items,
      remarks: note.remarks,
      termsText: orgSettings?.termsText,
      companyName: orgSettings?.companyName ?? note.organization?.name,
      companyAddress: orgSettings?.companyAddress,
      companyPhone: orgSettings?.companyPhone,
      companyFax: orgSettings?.companyFax,
      // logoBase64 and lessorSignature intentionally omitted —
      // they can be 200–500 KB in base64 and break WhatsApp's in-app browser.
    };
  }

  async submitRemoteSignature(
    token: string,
    signerName: string,
    signerRole: string | undefined,
    signature: string,
  ) {
    const note = await this.repo.findOne({ where: { signingToken: token } });
    if (!note) throw new NotFoundException('Link not found');
    if (note.status === 'signed') return { ok: true, alreadySigned: true };

    note.deliveredTo      = signerName;
    note.recipientRole    = signerRole ?? note.recipientRole;
    note.lesseeSignature  = signature;
    note.lesseeSignedAt   = new Date();
    note.lesseeSignerName = signerName;
    note.lesseeSignerRole = signerRole;
    note.status           = 'signed' as any;
    await this.repo.save(note);
    return { ok: true };
  }
}
