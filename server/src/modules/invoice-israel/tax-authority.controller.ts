import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TaxAuthoritySettingsService } from './tax-authority-settings.service';
import { UpdateTaxAuthoritySettingsDto } from './dto/update-tax-authority-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

/** Requirement #6 ("Invoice Israel") settings — admin-only, same
 * bucket as accounting/financial-reports (oversight/configuration,
 * not day-to-day document creation). */
@Controller('tax-authority')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TaxAuthorityController {
  constructor(private readonly service: TaxAuthoritySettingsService) {}

  @Get('settings')
  async getSettings(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    const s = await this.service.findOrCreate(user.organizationId);
    // Never return clientSecret/tokens — findOrCreate() already omits
    // them (select:false), this is just making that explicit.
    return {
      enabled: s.enabled,
      environment: s.environment,
      vatNumber: s.vatNumber,
      softwareRegistrationNumber: s.softwareRegistrationNumber,
      thresholdAmount: s.thresholdAmount,
      clientId: s.clientId,
      oauthScope: s.oauthScope,
      hasClientSecret: false, // overwritten below if actually set
      lastConnectedAt: s.lastConnectedAt,
      connected: !!s.lastConnectedAt,
    };
  }

  @Post('settings')
  async updateSettings(@Body() dto: UpdateTaxAuthoritySettingsDto, @CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    const s = await this.service.update(user.organizationId, dto);
    return { enabled: s.enabled, environment: s.environment };
  }

  /** Step 1 of the one-time OAuth login — returns the URL for the
   * admin panel to redirect the admin's browser to. They log into the
   * ITA's own site there, not this app. The organizationId is baked
   * into redirectUri itself (as a query param on OUR OWN callback
   * URL) rather than relying on carrying auth state through the ITA's
   * redirect — see TaxAuthorityCallbackController for why the
   * callback endpoint can't be behind the JWT guard this controller
   * uses. */
  @Get('connect')
  async connect(@CurrentUser() user: ReqUser, @Query('redirectUri') redirectUri: string) {
    if (user.organizationId == null) throw new Error('No organization');
    // orgId gets baked into the registered redirect_uri itself, so
    // the callback (which the ITA hits directly, carrying no
    // session/auth of its own) can read it straight off its own query
    // string.
    const withOrgId = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}orgId=${user.organizationId}`;
    const url = await this.service.buildAuthorizeUrl(user.organizationId, withOrgId);
    return { url };
  }
}
