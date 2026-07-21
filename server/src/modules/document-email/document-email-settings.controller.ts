import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEmailSettingsService, UpdateDocumentEmailSettingsDto } from './document-email-settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { assertCanEditDemoSettings } from '../../common/utils/demo-lockdown.util';

type RequestUser = { id: number; organizationId: number | null };

@Controller('document-email-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DocumentEmailSettingsController {
  constructor(
    private readonly settingsService: DocumentEmailSettingsService,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  @Get()
  get() {
    // appPassword is select:false already — safe to return directly.
    return this.settingsService.get();
  }

  @Put()
  async update(@Body() dto: UpdateDocumentEmailSettingsDto, @CurrentUser() user: RequestUser) {
    const demoOrg = await this.orgRepo.findOne({ where: { isDemoMode: true } });
    assertCanEditDemoSettings(!!demoOrg, user.organizationId);
    return this.settingsService.update(dto);
  }
}
