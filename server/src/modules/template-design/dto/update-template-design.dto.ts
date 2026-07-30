import { IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const HEX = /^#[0-9a-fA-F]{6}$/;

export class UpdateTemplateDesignDto {
  @IsString()
  @Matches(HEX, { message: 'must be a hex color like #1D3557' })
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @Matches(HEX, { message: 'must be a hex color like #1D3557' })
  @IsOptional()
  accentColor?: string;

  @IsString()
  @Matches(HEX, { message: 'must be a hex color like #1D3557' })
  @IsOptional()
  textColor?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  logoXPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  logoYPercent?: number;

  @IsNumber()
  @Min(1)
  @Max(30)
  @IsOptional()
  logoHeightPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  companyInfoXPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  companyInfoYPercent?: number;
}
