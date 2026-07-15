import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsEmail()
  emailAddress: string;

  // Only required when actually changing it — leaving it blank in the
  // admin panel keeps whatever's already stored, so re-saving the form
  // doesn't force re-entering the app password every time.
  @IsOptional()
  @IsString()
  @MinLength(1)
  appPassword?: string;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number;
}
