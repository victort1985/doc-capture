import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEmailSettings } from './entities/order-email-settings.entity';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';

@Injectable()
export class OrderEmailSettingsService {
  constructor(
    @InjectRepository(OrderEmailSettings)
    private readonly repo: Repository<OrderEmailSettings>,
  ) {}

  /** Always exactly one row — created on first read if missing. */
  async get(): Promise<OrderEmailSettings> {
    let settings = await this.repo.findOne({ where: {} });
    if (!settings) settings = await this.repo.save(this.repo.create({ enabled: false }));
    return settings;
  }

  /** With the app password included — only the poller needs this;
   * the admin panel gets the select:false-protected version via get(). */
  async getWithSecret(): Promise<OrderEmailSettings | null> {
    return this.repo
      .createQueryBuilder('s')
      .addSelect('s.appPassword')
      .getOne();
  }

  async update(dto: UpdateEmailSettingsDto): Promise<OrderEmailSettings> {
    const settings = await this.get();
    settings.enabled = dto.enabled;
    settings.emailAddress = dto.emailAddress;
    if (dto.appPassword) settings.appPassword = dto.appPassword.replace(/\s+/g, '');
    if (dto.imapHost) settings.imapHost = dto.imapHost;
    if (dto.imapPort) settings.imapPort = dto.imapPort;
    if (dto.notifyOnCompleteEnabled !== undefined) settings.notifyOnCompleteEnabled = dto.notifyOnCompleteEnabled;
    if (dto.notifyEmails !== undefined) settings.notifyEmails = dto.notifyEmails;
    return this.repo.save(settings);
  }

  async recordCheckResult(error: string | null, lastProcessedUid?: number): Promise<void> {
    const settings = await this.get();
    settings.lastCheckedAt = new Date();
    settings.lastError = error;
    if (lastProcessedUid !== undefined) settings.lastProcessedUid = lastProcessedUid;
    await this.repo.save(settings);
  }
}
