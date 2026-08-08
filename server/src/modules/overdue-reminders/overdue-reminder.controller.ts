import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { OverdueReminderService } from './overdue-reminder.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

class UpdateSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  thresholdDays: number[];

  @IsString()
  @IsOptional()
  messageTemplate?: string;
}

@Controller('overdue-reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class OverdueReminderController {
  constructor(private readonly service: OverdueReminderService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: ReqUser) {
    return this.service.getSettings(user.organizationId);
  }

  @Post('settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: ReqUser) {
    return this.service.updateSettings(user.organizationId, dto.enabled, dto.thresholdDays, dto.messageTemplate);
  }

  @Get('log')
  getLog(@CurrentUser() user: ReqUser) {
    return this.service.getLog(user.organizationId);
  }

  @Post('run-now')
  runNow() {
    return this.service.checkAndSend().then(() => ({ triggered: true }));
  }
}
