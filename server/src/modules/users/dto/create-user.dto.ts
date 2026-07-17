import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  language?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  specialization?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsInt()
  @IsOptional()
  cityId?: number;

  // IDs of regions this technician covers — drives which new calls they're
  // notified about. Omit/empty for a non-technician or a purely global user.
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  regionIds?: number[];

  @IsBoolean()
  @IsOptional()
  isGlobal?: boolean;

  // Multi-tenant boundary — omit entirely to create a super-admin (only
  // allowed when the requester is themselves a super-admin; enforced in
  // UsersService, not just here, since DTO validation alone can't see
  // who's making the request).
  @IsInt()
  @IsOptional()
  organizationId?: number;

  /** Organizations this user can switch into in the mobile app. */
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedOrganizationIds?: number[];

  /** Per-user feature permission overrides, e.g. { warehouseTransfer: true }. */
  @IsOptional()
  permissions?: Record<string, boolean>;

  /** Group whose permissions apply beneath this user's own overrides.
   * Pass null to remove from any group. */
  @IsInt()
  @IsOptional()
  groupId?: number | null;
}
