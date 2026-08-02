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

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  houseNumber?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  zip?: string;

  @IsString()
  @IsOptional()
  companyRegistrationNumber?: string;

  @IsString()
  @IsOptional()
  deductionsFileNumber?: string;
}
