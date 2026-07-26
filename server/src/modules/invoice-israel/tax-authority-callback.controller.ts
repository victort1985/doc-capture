import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TaxAuthoritySettingsService } from './tax-authority-settings.service';

/**
 * Deliberately NOT behind JwtAuthGuard — this endpoint is hit by the
 * ITA's own OAuth server redirecting the admin's BROWSER back here
 * after they log into the ITA's site, which carries no Authorization
 * header at all (it's a plain GET navigation, not an API call this
 * app's JS made). Putting this behind the same guard as
 * TaxAuthorityController would make the whole OAuth flow silently
 * impossible — every callback would 401 before ever reaching this
 * code.
 *
 * Security here comes from the OAuth flow itself instead: the `code`
 * is single-use and was only ever issued because someone with valid
 * ITA credentials completed the login at the exact redirect_uri this
 * app registered — not from any of this app's own auth. The orgId is
 * carried through as a query param baked into that same redirect_uri
 * (see TaxAuthorityController.connect()), not trusted as arbitrary
 * user input on its own.
 */
@Controller('tax-authority')
export class TaxAuthorityCallbackController {
  constructor(private readonly service: TaxAuthoritySettingsService) {}

  @Get('callback')
  async callback(@Req() req: Request, @Query('code') code: string, @Query('orgId') orgIdParam: string, @Res() res: Response) {
    try {
      const orgId = Number(orgIdParam);
      if (!Number.isFinite(orgId)) throw new Error('Missing or invalid organization reference in callback URL');
      if (!code) throw new Error('No authorization code received from the Tax Authority');

      // OAuth2 requires redirect_uri in the token exchange to match
      // the one sent in the original /authorize request BYTE FOR
      // BYTE, including every query param. Reconstructing it from
      // this request's own actual URL (minus the `code` param the
      // ITA appended) is the one approach guaranteed to match, since
      // that's exactly what "the ITA redirected back to" means — no
      // env var or separately-passed value can drift out of sync
      // with it the way a hand-copied one could.
      const fullUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
      fullUrl.searchParams.delete('code');
      const redirectUri = fullUrl.toString();

      await this.service.handleCallback(orgId, code, redirectUri);
      res.redirect('/tax-authority-settings?connected=1');
    } catch (err) {
      res.redirect(`/tax-authority-settings?error=${encodeURIComponent((err as Error).message)}`);
    }
  }
}
