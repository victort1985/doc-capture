import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  /** Mobile app only — see DevicesService. Web admin-panel logins never send this. */
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
