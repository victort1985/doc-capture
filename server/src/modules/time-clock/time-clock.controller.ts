import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TimeClockService } from './time-clock.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; role: string; organizationId: number | null; permissions?: Record<string, boolean> };

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

  /** Explicitly sends a real JSON body (`res.json(null)`) rather than
   * returning the value directly — NestJS/Express's default behavior
   * for a controller returning JS `null` is an EMPTY response body
   * with no Content-Type at all (confirmed by inspecting the raw
   * response: Content-Length: 0, no Content-Type header), not valid
   * JSON `null`. That's genuinely surprising for an endpoint whose
   * whole contract is "returns the shift, or null" — a client's JSON
   * parser has nothing to parse and has to guess what an empty body
   * means, which is exactly what caused a real mobile bug (a "String
   * is not a subtype of Map" cast error instead of correctly reading
   * "no open shift" — found via a real-device screenshot, fixed
   * defensively on the client too, but this is the actual root
   * cause). */
  @Get('my-status')
  async getMyStatus(@CurrentUser() user: ReqUser, @Res() res: Response) {
    const shift = await this.service.getMyOpenShift(user.id);
    res.json(shift);
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

  /** Backfills a whole shift at once — gated by the specific
   * payroll.manageTimeClockEntries permission rather than blanket
   * @Roles(ADMIN) like most of this controller's other endpoints, so
   * an admin can grant this one narrow ability (fixing/entering
   * attendance) to someone without handing them everything else ADMIN
   * implies. Admins have it by default anyway (see
   * ROLE_DEFAULTS[ADMIN] — every key true), so this check alone
   * already covers both cases without needing @Roles too. */
  @Post('manual-entry')
  createManualEntry(
    @Body() body: { userId: number; date: string; startTime: string; endTime: string; costCenterId?: number },
    @CurrentUser() user: ReqUser,
  ) {
    if (!user.permissions?.['payroll.manageTimeClockEntries']) {
      throw new ForbiddenException('You do not have permission to manually add time clock entries.');
    }
    return this.service.createManualEntry(body.userId, user.organizationId, body.date, body.startTime, body.endTime, body.costCenterId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async removeEntry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.service.removeEntry(id, user.organizationId);
    return { deleted: true };
  }
}
