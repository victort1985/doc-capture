import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TimeClockService } from './time-clock.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('time-clock')
@UseGuards(JwtAuthGuard)
export class TimeClockController {
  constructor(private readonly service: TimeClockService) {}

  @Post('clock-in')
  clockIn(@Body() body: { costCenterId?: number }, @CurrentUser() user: ReqUser) {
    return this.service.clockIn(user.id, user.organizationId, body?.costCenterId);
  }

  @Post('clock-out')
  clockOut(@Body() body: { notes?: string }, @CurrentUser() user: ReqUser) {
    return this.service.clockOut(user.id, body?.notes);
  }

  @Get('my-status')
  getMyStatus(@CurrentUser() user: ReqUser) {
    return this.service.getMyOpenShift(user.id);
  }

  @Get('entries')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getEntries(@Query('from') from: string, @Query('to') to: string, @Query('userId') userId: string | undefined, @CurrentUser() user: ReqUser) {
    return this.service.getEntries(user.organizationId, from, to, userId ? Number(userId) : undefined);
  }

  @Get('timesheet')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getTimesheet(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: ReqUser) {
    return this.service.getTimesheet(user.organizationId, from, to);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adjustEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { clockIn?: string; clockOut?: string | null },
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.adjustEntry(id, user.organizationId, body.clockIn, body.clockOut);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async removeEntry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.service.removeEntry(id, user.organizationId);
    return { deleted: true };
  }
}
