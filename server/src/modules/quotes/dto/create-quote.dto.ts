import { IsArray, IsEmail, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class QuoteItemDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateQuoteDto {
  @IsString()
  clientName: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  /** Inherits an existing order-processing chain (e.g. this quote is
   * being added to a chain that already has a delivery note) instead
   * of starting a fresh one — see order-chain module. */
  @IsString()
  @IsOptional()
  chainId?: string;
}
