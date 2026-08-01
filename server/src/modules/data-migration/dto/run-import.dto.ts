import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ContactCategory } from '../../phonebook/entities/phonebook-contact.entity';

export class RunImportDto {
  @IsIn(['contacts'])
  target: 'contacts';

  /** Every row in this import lands under one category — Chashbashevet
   * exports customers (לקוחות) and suppliers (ספקים) as separate
   * account-index screens/files, so there's never a per-row category
   * column to map; the person picks it once for the whole file in the
   * wizard instead. */
  @IsIn(Object.values(ContactCategory))
  category: ContactCategory;

  /** Maps target field name -> source column header from the
   * uploaded file, e.g. { firstName: 'שם פרטי', phone: 'טלפון' }.
   * Any target field left unmapped (absent from this object) is
   * simply left blank on every imported row. */
  @IsObject()
  mapping: Record<string, string>;

  @IsString()
  @IsOptional()
  fileToken?: string;
}
