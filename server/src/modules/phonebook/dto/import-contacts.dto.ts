import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { ContactCategory } from '../entities/phonebook-contact.entity';

export class ParsedContactDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** The category (client/technician/supplier) applies to the whole
 * import batch — vCard has no equivalent concept, so the admin picks
 * one for everything selected in this import. */
export class CommitImportDto {
  @IsEnum(ContactCategory)
  category: ContactCategory;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParsedContactDto)
  contacts: ParsedContactDto[];
}
