import { IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { ContactCategory } from '../entities/phonebook-contact.entity';

export class CreateContactDto {
  @IsInt()
  @IsOptional()
  clientIdentifier?: number;

  @IsEnum(ContactCategory)
  category: ContactCategory;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsInt()
  @IsOptional()
  cityId?: number;

  @IsInt()
  @IsOptional()
  organizationId?: number;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsInt()
  @IsOptional()
  paymentTermsDays?: number;

  @IsOptional()
  creditLimit?: number;
}
