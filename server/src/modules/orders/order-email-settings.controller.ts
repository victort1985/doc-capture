import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEmailSettingsService } from './order-email-settings.service';
import { GmailOrderPollerService } from './gmail-order-poller.service';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { assertCanEditDemoSettings } from '../../common/utils/demo-lockdown.util';

type RequestUser = { id: number; organizationId: number | null };

@Controller('orders/email-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class OrderEmailSettingsController {
  constructor(
    private readonly settingsService: OrderEmailSettingsService,
    private readonly pollerService: GmailOrderPollerService,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  @Get()
  async get() {
    const settings = await this.settingsService.get();
    // appPassword is select:false already, so it's never present here
    // to begin with -- returning the entity directly is safe.
    return settings;
  }

  @Put()
  async update(@Body() dto: UpdateEmailSettingsDto, @CurrentUser() user: RequestUser) {
    // This settings row is one-per-tenant (Variant B: each tenant
    // already has its own DB/process), not org-scoped by id — so
    // "is THIS tenant a demo" just means "does any org here have
    // isDemoMode set".
    const demoOrg = await this.orgRepo.findOne({ where: { isDemoMode: true } });
    assertCanEditDemoSettings(!!demoOrg, user.organizationId);
    return this.settingsService.update(dto);
  }

  /** Manual trigger for the admin panel's "Sync now" button — runs the
   * same poll the 5-minute cron does, then returns the refreshed
   * settings (lastCheckedAt/lastError) so the UI can show the result
   * immediately instead of waiting for the next scheduled tick. */
  @Post('sync-now')
  async syncNow() {
    await this.pollerService.poll();
    return this.settingsService.get();
  }
}
