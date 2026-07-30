import { IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class InvoiceItemDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateInvoiceDto {
  @IsString()
  clientName: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  clientTaxId?: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  /** Locks a specific rate instead of auto-fetching the day's Bank
   * of Israel rate — useful when a price was already negotiated at a
   * specific rate with the client. */
  @IsNumber()
  @IsOptional()
  exchangeRateToIls?: number;

  @IsIn(['standard', 'zero', 'exempt'])
  @IsOptional()
  vatCategory?: 'standard' | 'zero' | 'exempt';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @IsOptional()
  quoteId?: number;

  @IsInt()
  @IsOptional()
  deliveryNoteId?: number;

  /** Falls back to this if quoteId isn't set — e.g. an invoice created
   * from a delivery note rather than a quote. See order-chain module. */
  @IsString()
  @IsOptional()
  chainId?: string;
}
