import { IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreditNoteItemDto {
  @IsString()
  description: string;

  quantity: number;
  unitPrice: number;
}

export class CreateCreditNoteDto {
  /** The invoice being corrected — required, see CreditNote.invoiceId. */
  @IsInt()
  invoiceId: number;

  @IsString()
  clientName: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  date?: string;

  /** Why this correction is being issued — required. A credit note
   * with no stated reason is exactly the kind of undocumented
   * after-the-fact change tax law is designed to prevent; this field
   * exists to make "why" part of the permanent record, not optional. */
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsArray()
  items: CreditNoteItemDto[];
}
