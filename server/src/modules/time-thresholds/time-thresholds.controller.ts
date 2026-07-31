import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TimeThresholdsService } from './time-thresholds.service';
import { UpdateTimeThresholdsDto } from './dto/update-time-thresholds.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller('time-thresholds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimeThresholdsController {
  constructor(private readonly service: TimeThresholdsService) {}

  /** Deliberately readable by ANY authenticated user, not admin-only
   * — every person viewing the calls/vehicles/rentals lists needs
   * these values to compute the same colors everyone else sees,
   * unlike most other org-settings pages which only the person
   * configuring them ever reads. */
  @Get()
  async get(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.findOrCreate(user.organizationId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async update(@Body() dto: UpdateTimeThresholdsDto, @CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.update(user.organizationId, dto);
  }
}
