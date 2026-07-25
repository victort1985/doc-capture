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

  /** Present only once the client has been told TOTP_REQUIRED and the
   * person has typed their 6-digit code from their authenticator app. */
  @IsOptional()
  @IsString()
  totpCode?: string;
}
