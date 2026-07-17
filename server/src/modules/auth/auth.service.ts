import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { resolveEffectivePermissions } from '../users/permissions.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        language: user.language,
        role: user.role,
        organizationId: user.organization?.id ?? null,
        allowedOrganizationIds: user.allowedOrganizationIds ?? [],
        // Fully resolved (role default -> group -> user override), not
        // the raw override map — the client shouldn't need to know
        // about role defaults or groups to answer "can this user see X".
        permissions: resolveEffectivePermissions(user.role, user.group?.permissions, user.permissions),
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
      },
    };
  }
}
