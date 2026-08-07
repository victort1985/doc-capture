import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateSupplierInvoiceDto {
  @IsString()
  @IsNotEmpty()
  supplierName: string;

  @IsInt()
  @IsOptional()
  supplierContactId?: number;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  /** See SupplierInvoice.vatAmount's own doc comment — optional, how
   * much of `amount` is VAT. */
  @IsNumber()
  @IsOptional()
  vatAmount?: number;
}
