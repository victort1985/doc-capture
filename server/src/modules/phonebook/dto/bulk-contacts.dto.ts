import { ArrayMinSize, IsArray, IsEnum, IsInt } from 'class-validator';
import { ContactCategory } from '../entities/phonebook-contact.entity';

export class BulkUpdateCategoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];

  @IsEnum(ContactCategory)
  category: ContactCategory;
}

export class BulkDeleteDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}
