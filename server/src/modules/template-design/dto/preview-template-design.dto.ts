import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DocTemplate } from '../../documents/document-pdf.util';

const TEMPLATES: DocTemplate[] = ['classic', 'modern', 'minimalist', 'ledger', 'atelier', 'blueprint', 'marquee', 'minimalMono', 'stampSeal'];

export class PreviewTemplateDesignDto {
  @IsIn(TEMPLATES)
  template: DocTemplate;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsString()
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
  @Min(0)
  @Max(100)
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
