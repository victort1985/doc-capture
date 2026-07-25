import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BusinessType } from '../entities/organization.entity';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(BusinessType)
  @IsOptional()
  businessType?: BusinessType;

  @IsString()
  @IsOptional()
  taxId?: string;
}
