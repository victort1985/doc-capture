import { IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DebitNoteItemDto {
  @IsString()
  description: string;

  quantity: number;
  unitPrice: number;
}

export class CreateDebitNoteDto {
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

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsArray()
  items: DebitNoteItemDto[];
}
