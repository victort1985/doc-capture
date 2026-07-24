import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentCategory, DocumentTypeSettings } from './entities/document-type-settings.entity';

@Injectable()
export class DocumentStorageSettingsService {
  constructor(
    @InjectRepository(DocumentTypeSettings)
    private readonly repo: Repository<DocumentTypeSettings>,
  ) {}

  async findAll(organizationId: number | null): Promise<DocumentTypeSettings[]> {
    const existing = await this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      relations: ['storageConnection', 'organization'],
    });
    const byType = new Map(existing.map((s) => [s.documentType, s]));
    // Always return one row per category, even if never configured yet,
    // so the admin panel has something to render/edit for all five.
    return Object.values(DocumentCategory).map(
      (type) => byType.get(type) ?? this.repo.create({ documentType: type }),
    );
  }

  /** Single-category lookup — used by services that just need "which
   * connection does this document type go to" (e.g. the order-intake
   * poller, which isn't itself organization-scoped the way documents
   * created from the app are). */
  async findOne(documentType: DocumentCategory, organizationId: number | null): Promise<DocumentTypeSettings | null> {
    return this.repo.findOne({
      where: { documentType, organization: organizationId != null ? { id: organizationId } : undefined },
      relations: ['storageConnection'],
    });
  }

  async upsert(
    documentType: DocumentCategory,
    organizationId: number | null,
    dto: { storageConnectionId?: number | null; pathPattern?: string; filenameTemplate?: string },
  ): Promise<DocumentTypeSettings> {
    let row = await this.repo.findOne({
      where: {
        documentType,
        organization: organizationId != null ? { id: organizationId } : undefined,
      },
      relations: ['storageConnection'],
    });
    if (!row) {
      row = this.repo.create({
        documentType,
        organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      });
    }
    if (dto.pathPattern != null) row.pathPattern = dto.pathPattern;
    if (dto.filenameTemplate != null) row.filenameTemplate = dto.filenameTemplate;
    if (dto.storageConnectionId !== undefined) {
      row.storageConnection = dto.storageConnectionId ? ({ id: dto.storageConnectionId } as any) : undefined;
    }
    return this.repo.save(row);
  }
}
