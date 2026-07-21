import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEmailSettings } from './entities/document-email-settings.entity';

export interface UpdateDocumentEmailSettingsDto {
  emailAddress?: string;
  appPassword?: string;
}

@Injectable()
export class DocumentEmailSettingsService {
  constructor(
    @InjectRepository(DocumentEmailSettings)
    private readonly repo: Repository<DocumentEmailSettings>,
  ) {}

  /** Always exactly one row — created on first read if missing. */
  async get(): Promise<DocumentEmailSettings> {
    let settings = await this.repo.findOne({ where: {} });
    if (!settings) settings = await this.repo.save(this.repo.create({}));
    return settings;
  }

  /** With the app password included — only the actual sender needs
   * this; the admin panel gets the select:false-protected version via get(). */
  async getWithSecret(): Promise<DocumentEmailSettings | null> {
    return this.repo.createQueryBuilder('s').addSelect('s.appPassword').getOne();
  }

  async update(dto: UpdateDocumentEmailSettingsDto): Promise<DocumentEmailSettings> {
    const settings = await this.get();
    if (dto.emailAddress !== undefined) settings.emailAddress = dto.emailAddress;
    if (dto.appPassword) settings.appPassword = dto.appPassword;
    return this.repo.save(settings);
  }
}
