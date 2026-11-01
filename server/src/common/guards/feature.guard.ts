import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_FEATURES_KEY } from '../decorators/require-feature.decorator';

/** Checks the effective permissions that JwtStrategy puts on req.user
 * (user override > group override > role default). */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<string[]>(REQUIRED_FEATURES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user;
    const missing = required.filter((k) => !user?.permissions?.[k]);
    if (missing.length) throw new ForbiddenException(`You do not have permission: ${missing.join(', ')}`);
    return true;
  }
}
