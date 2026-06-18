import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { TemplateAppliesTo } from '../entities/file-template.entity';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  pattern: string;

  @IsEnum(TemplateAppliesTo)
  @IsOptional()
  appliesTo?: TemplateAppliesTo;

  @IsNumber()
  @IsOptional()
  userId?: number;
}
