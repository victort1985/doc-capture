import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxAuthoritySettings } from './entities/tax-authority-settings.entity';

const BASE_URLS = {
  sandbox: 'https://openapi.taxes.gov.il/shaam/Tsandbox',
  production: 'https://openapi.taxes.gov.il/shaam/production',
};

/**
 * OAuth2 client for the ITA's developer portal, following the exact
 * two-step flow documented in "Israel Tax Authority — Login
 * Instructions" (secapp.taxes.gov.il/OpenAPIUserGuide/
 * OpenAPIUserGuide.pdf): an authorization_code grant, not
 * client_credentials — meaning a human has to interactively log into
 * the ITA's own site once (step 1, the /authorize redirect) before
 * this app can start exchanging codes for tokens on its own (step 2).
 * After that first login, the refresh_token lets this service renew
 * access without further human interaction, until the refresh token
 * itself expires (per third-party sources, roughly every 3 months —
 * the ITA's own documents don't state an exact refresh-token lifetime
 * anywhere I could find, so this needs verifying against Victor's own
 * sandbox once he has real credentials).
 */
@Injectable()
export class TaxAuthorityOAuthService {
  private readonly logger = new Logger(TaxAuthorityOAuthService.name);

  constructor(
    @InjectRepository(TaxAuthoritySettings) private readonly settingsRepo: Repository<TaxAuthoritySettings>,
  ) {}

  /** Step 1 — the URL to send an admin's browser to. They log into
   * the ITA's own site (not this app), and the ITA redirects back to
   * redirectUri with a one-time authorization code as a query param. */
  buildAuthorizeUrl(settings: TaxAuthoritySettings, redirectUri: string, scope: string): string {
    const base = BASE_URLS[settings.environment];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: settings.clientId ?? '',
      scope,
      redirect_uri: redirectUri,
    });
    return `${base}/longtimetoken/oauth2/authorize?${params.toString()}`;
  }

  /** Step 2 — exchanges the one-time code from step 1 for an access
   * token + refresh token. Called once, right after the redirect back
   * from step 1 lands on this app's callback endpoint. */
  async exchangeCodeForToken(settings: TaxAuthoritySettings, code: string, redirectUri: string, scope: string): Promise<void> {
    const base = BASE_URLS[settings.environment];
    const basicAuth = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope,
    });

    const res = await fetch(`${base}/longtimetoken/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    settings.accessToken = json.access_token;
    if (json.refresh_token) settings.refreshToken = json.refresh_token;
    settings.accessTokenExpiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
    settings.lastConnectedAt = new Date();
    await this.settingsRepo.save(settings);
  }

  /** Uses the stored refresh_token to get a fresh access_token
   * without any human interaction — this is what makes ongoing
   * automatic invoice reporting possible after the one-time login. */
  async refreshAccessToken(settings: TaxAuthoritySettings): Promise<void> {
    if (!settings.refreshToken) throw new Error('No refresh token stored — the organization needs to reconnect via the OAuth login flow.');
    const base = BASE_URLS[settings.environment];
    const basicAuth = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: settings.refreshToken,
    });

    const res = await fetch(`${base}/longtimetoken/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Token refresh failed (${res.status}): ${text} — the organization likely needs to reconnect via the OAuth login flow (refresh tokens don't last forever).`);
    }

    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    settings.accessToken = json.access_token;
    if (json.refresh_token) settings.refreshToken = json.refresh_token; // some OAuth2 servers rotate the refresh token too
    settings.accessTokenExpiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
    await this.settingsRepo.save(settings);
  }

  /** Returns a valid access token, refreshing first if the stored one
   * is expired or close to it — callers never have to think about
   * token lifecycle themselves. */
  async getValidAccessToken(settings: TaxAuthoritySettings): Promise<string> {
    const soonExpiring = !settings.accessTokenExpiresAt || settings.accessTokenExpiresAt.getTime() - Date.now() < 60_000;
    if (soonExpiring) {
      try {
        await this.refreshAccessToken(settings);
      } catch (err) {
        this.logger.error(`Token refresh failed for org ${settings.organization?.id}: ${(err as Error).message}`);
        throw err;
      }
    }
    if (!settings.accessToken) throw new Error('No access token available — the organization needs to connect via the OAuth login flow first.');
    return settings.accessToken;
  }
}
