import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number; organizationId: number | null };

@Controller('calendar/google')
export class GoogleCalendarController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly calendarService: CalendarService,
  ) {}

  /** Where to send the admin's browser to start the Google consent flow. */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAuthUrl(@CurrentUser() user: RequestUser, @Query('organizationId') orgIdParam?: string) {
    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : user.organizationId;
    if (orgId == null) return { url: null };
    const calendar = await this.calendarService.getOrCreateOrgCalendar(orgId, user.id);
    return { url: this.googleCalendarService.getAuthUrl(calendar.id) };
  }

  /** Whether a Google account is connected for the given org's calendar. */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getStatus(@CurrentUser() user: RequestUser, @Query('organizationId') orgIdParam?: string) {
    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : user.organizationId;
    if (orgId == null) return { connectedEmail: null, lastSyncedAt: null };
    const calendar = await this.calendarService.getOrCreateOrgCalendar(orgId, user.id);
    return { connectedEmail: calendar.googleConnectedEmail ?? null, lastSyncedAt: calendar.googleLastSyncedAt ?? null };
  }

  /** Google redirects the browser here after the admin approves consent —
   * no JWT available at this point, so the calendar id travels in `state`. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const calendarId = parseInt(state, 10);
    try {
      await this.googleCalendarService.handleCallback(code, calendarId);
      await this.googleCalendarService.syncCalendar(calendarId); // immediate first sync
      res.redirect('/calendar-sync?google=connected');
    } catch (err: any) {
      res.redirect(`/calendar-sync?google=error&message=${encodeURIComponent(err?.message ?? 'Unknown error')}`);
    }
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async disconnect(@CurrentUser() user: RequestUser, @Query('organizationId') orgIdParam?: string) {
    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : user.organizationId;
    if (orgId == null) return { ok: false };
    const calendar = await this.calendarService.getOrCreateOrgCalendar(orgId, user.id);
    await this.googleCalendarService.disconnect(calendar.id);
    return { ok: true };
  }

  @Post('sync-now')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async syncNow(@CurrentUser() user: RequestUser, @Query('organizationId') orgIdParam?: string) {
    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : user.organizationId;
    if (orgId == null) return { imported: 0, updated: 0, removed: 0 };
    const calendar = await this.calendarService.getOrCreateOrgCalendar(orgId, user.id);
    return this.googleCalendarService.syncCalendar(calendar.id);
  }
}
