import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { GoogleContactsService } from './google-contacts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number };

@Controller('phonebook/import/google')
export class GoogleContactsController {
  constructor(private readonly googleContactsService: GoogleContactsService) {}

  /** Where to send the admin's browser to start the Google consent flow. */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAuthUrl(@CurrentUser() user: RequestUser) {
    return { url: this.googleContactsService.getAuthUrl(user.id) };
  }

  /** Google redirects the browser here after the admin approves consent
   * — no JWT available at this point, so the user id travels in `state`.
   * Fetches the contact list immediately, stashes it, and bounces back
   * to the admin panel with a one-time session id to read it with. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const userId = parseInt(state, 10);
    try {
      const { sessionId } = await this.googleContactsService.handleCallback(code, userId);
      res.redirect(`/phonebook?googleImportSession=${sessionId}`);
    } catch (err: any) {
      res.redirect(`/phonebook?googleImportError=${encodeURIComponent(err?.message ?? 'Unknown error')}`);
    }
  }

  /** One-time read of the fetched contact list — see
   * GoogleImportSession's doc comment. */
  @Get(':sessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  consumeSession(@Param('sessionId', ParseIntPipe) sessionId: number, @CurrentUser() user: RequestUser) {
    return this.googleContactsService.consumeSession(sessionId, user.id);
  }
}
