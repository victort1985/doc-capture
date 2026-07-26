import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxAuthoritySettings } from './entities/tax-authority-settings.entity';
import { UpdateTaxAuthoritySettingsDto } from './dto/update-tax-authority-settings.dto';
import { TaxAuthorityOAuthService } from './tax-authority-oauth.service';

@Injectable()
export class TaxAuthoritySettingsService {
  constructor(
    @InjectRepository(TaxAuthoritySettings) private readonly repo: Repository<TaxAuthoritySettings>,
    private readonly oauth: TaxAuthorityOAuthService,
  ) {}

  async findOrCreate(organizationId: number): Promise<TaxAuthoritySettings> {
    let settings = await this.repo.findOne({ where: { organization: { id: organizationId } } });
    if (!settings) {
      settings = this.repo.create({ organization: { id: organizationId } as any });
      settings = await this.repo.save(settings);
    }
    return settings;
  }

  /** For internal callers (the allocation service) that need the
   * actual secrets — the public findOrCreate() above never exposes
   * clientSecret/accessToken/refreshToken since those columns are
   * select:false by default. */
  async findWithSecrets(organizationId: number): Promise<TaxAuthoritySettings | null> {
    return this.repo.findOne({
      where: { organization: { id: organizationId } },
      relations: ['organization'],
      select: {
        id: true, enabled: true, environment: true, vatNumber: true, softwareRegistrationNumber: true, thresholdAmount: true,
        clientId: true, oauthScope: true, clientSecret: true, accessToken: true, refreshToken: true, accessTokenExpiresAt: true,
        lastConnectedAt: true,
      },
    });
  }

  async update(organizationId: number, dto: UpdateTaxAuthoritySettingsDto): Promise<TaxAuthoritySettings> {
    const settings = await this.findOrCreate(organizationId);
    if (dto.enabled != null) settings.enabled = dto.enabled;
    if (dto.environment) settings.environment = dto.environment;
    if (dto.vatNumber != null) settings.vatNumber = dto.vatNumber;
    if (dto.softwareRegistrationNumber != null) settings.softwareRegistrationNumber = dto.softwareRegistrationNumber;
    if (dto.thresholdAmount != null) settings.thresholdAmount = dto.thresholdAmount;
    if (dto.clientId != null) settings.clientId = dto.clientId;
    if (dto.oauthScope != null) settings.oauthScope = dto.oauthScope;
    if (dto.clientSecret) settings.clientSecret = dto.clientSecret; // omit entirely to keep existing, matches every other "secret" field pattern in this app
    return this.repo.save(settings);
  }

  /** Step 1 of the OAuth flow — builds the URL an admin's browser
   * needs to be sent to. Requires clientId to already be saved (from
   * the ITA developer portal's "app" config). */
  async buildAuthorizeUrl(organizationId: number, redirectUri: string): Promise<string> {
    const settings = await this.findWithSecrets(organizationId);
    if (!settings?.clientId) throw new BadRequestException('Set Client ID (from the Tax Authority developer portal) before connecting.');
    if (!settings.oauthScope) throw new BadRequestException('Set the OAuth Scope (from the Tax Authority developer portal\'s app page) before connecting.');
    return this.oauth.buildAuthorizeUrl(settings, redirectUri, settings.oauthScope);
  }

  /** Step 2 — called by the callback endpoint once the ITA redirects
   * back with a one-time code. */
  async handleCallback(organizationId: number, code: string, redirectUri: string): Promise<void> {
    const settings = await this.findWithSecrets(organizationId);
    if (!settings?.clientId || !settings.clientSecret) throw new BadRequestException('Client ID/Secret not configured.');
    if (!settings.oauthScope) throw new BadRequestException('OAuth Scope not configured.');
    await this.oauth.exchangeCodeForToken(settings, code, redirectUri, settings.oauthScope);
  }
}
