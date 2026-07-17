import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { LicenseService } from './license.service';

// Static admin-panel/mobile-app assets aren't NestJS routes (served by
// ServeStaticModule, never reaches a guard) — this only ever sees
// requests under the global 'api' prefix, so it's safe to gate
// everything except the two license endpoints themselves without
// accidentally blocking the JS/HTML that renders the lock screen.
const ALWAYS_ALLOWED_PATHS = ['/api/license/status', '/api/license/activate'];

/**
 * Enforces the grace-period timeline from license.constants.ts:
 *   OK / WARNING        -> everyone through
 *   ADMIN_LOCKED        -> blocks requests from the admin panel
 *                          (X-Client-Type: admin-panel), mobile app
 *                          keeps working
 *   FULL_LOCKED         -> blocks everyone
 * "Admin panel" vs "mobile app" is distinguished by a header each
 * client sets on every request — see admin-panel/src/services/api.ts
 * and mobile-client/lib/services/api_service.dart.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly licenseService: LicenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (ALWAYS_ALLOWED_PATHS.includes(req.path)) return true;

    const status = await this.licenseService.getStatus();
    const clientType = req.headers['x-client-type'];

    if (status.state === 'FULL_LOCKED') {
      throw new ForbiddenException({
        code: 'LICENSE_LOCKED',
        message: 'This installation is locked — the license has not been verified recently enough. Contact your provider.',
      });
    }
    if (status.state === 'ADMIN_LOCKED' && clientType !== 'mobile') {
      throw new ForbiddenException({
        code: 'LICENSE_ADMIN_LOCKED',
        message: 'The admin panel is locked pending a license check. The mobile app keeps working for now.',
      });
    }
    return true;
  }
}
