import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateTaxAuthoritySettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsIn(['sandbox', 'production'])
  @IsOptional()
  environment?: 'sandbox' | 'production';

  @IsString()
  @IsOptional()
  vatNumber?: string;

  @IsString()
  @IsOptional()
  softwareRegistrationNumber?: string;

  @IsNumber()
  @IsOptional()
  thresholdAmount?: number;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  oauthScope?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;
}
