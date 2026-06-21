import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Stricter than RolesGuard(UserRole.ADMIN): only the super-admin (admin
 * role AND organization === null) passes — an org-scoped admin is still
 * 'admin' role but manages only their own organization's data, not
 * organizations themselves. See User.organization for the full
 * multi-tenancy explanation.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    return user?.role === 'admin' && user?.organizationId == null;
  }
}
