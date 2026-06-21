import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change_me',
    });
  }

  async validate(payload: JwtPayload) {
    // Re-checks the live user on every request (not just at login) so a
    // disabled or deleted account is locked out immediately instead of
    // staying valid on its existing token until natural expiry (up to
    // JWT_EXPIRES_IN, 7 days by default). Also picks up live `language`
    // for endpoints like /auth/me.
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account disabled');
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      // null = super-admin (sees/manages everything); set = scoped to
      // that organization's data only. Always derived from the live DB
      // row above, never trusted from the JWT payload itself.
      organizationId: user.organization?.id ?? null,
    };
  }
}
