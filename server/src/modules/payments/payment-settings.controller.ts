import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseIntPipe,
  Post, Put, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentSettings } from './entities/payment-settings.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

type ReqUser = { id: number; organizationId: number | null };

@Controller('payment-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PaymentSettingsController {
  constructor(
    @InjectRepository(PaymentSettings) private readonly repo: Repository<PaymentSettings>,
    private readonly usersService: UsersService,
  ) {}

  @Get(':orgId')
  async getByOrg(@Param('orgId', ParseIntPipe) orgId: number) {
    return (await this.repo.findOne({ where: { organization: { id: orgId } }, relations: ['storageConnection'] })) ?? {};
  }

  @Put(':orgId')
  async upsert(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: { footerText?: string; storageConnectionId?: number | null; template?: string; autoSendEmail?: boolean },
  ) {
    let settings = await this.repo.findOne({ where: { organization: { id: orgId } } });
    if (!settings) settings = this.repo.create({ organization: { id: orgId } as any });
    if (dto.footerText !== undefined) settings.footerText = dto.footerText;
    if (dto.template !== undefined) settings.template = dto.template;
    if (dto.autoSendEmail !== undefined) settings.autoSendEmail = dto.autoSendEmail;
    if (dto.storageConnectionId !== undefined) {
      settings.storageConnection = dto.storageConnectionId == null ? undefined : ({ id: dto.storageConnectionId } as any);
    }
    return this.repo.save(settings);
  }

  /** One-time, irreversible: sets numberPrefix/startingNumber and
   * locks them. Requires the acting admin to re-enter their own
   * password — same as quote/invoice/delivery-note numbering locks. */
  @Post(':orgId/lock-numbering')
  async lockNumbering(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() body: { prefix?: string; startingNumber: number; password: string },
    @CurrentUser() user: ReqUser,
  ) {
    if (!body.password) throw new BadRequestException('Password is required to confirm this change');
    if (body.startingNumber == null || !Number.isInteger(body.startingNumber) || body.startingNumber < 0) {
      throw new BadRequestException('startingNumber must be a non-negative integer');
    }

    const ok = await this.usersService.verifyPassword(user.id, body.password);
    if (!ok) throw new ForbiddenException('Incorrect password');

    let settings = await this.repo.findOne({ where: { organization: { id: orgId } } });
    if (!settings) settings = this.repo.create({ organization: { id: orgId } as any });
    if (settings.numberLocked) {
      throw new BadRequestException('Numbering is already locked for this organization and cannot be changed again.');
    }

    settings.numberPrefix = body.prefix ?? null;
    settings.startingNumber = body.startingNumber;
    settings.numberLocked = true;
    return this.repo.save(settings);
  }
}
