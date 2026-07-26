import { IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReturnItemDto {
  @IsString()
  name: string;

  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @IsOptional()
  warehouseItemId?: number;
}

export class CreateReturnDto {
  @IsInt()
  deliveryNoteId: number;

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
  items: ReturnItemDto[];
}
