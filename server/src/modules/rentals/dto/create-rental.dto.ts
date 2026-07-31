import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateRentalDto {
  @IsInt()
  warehouseItemId: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  quantity?: number;

  @IsInt()
  @IsOptional()
  contactId?: number;

  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsString()
  @IsOptional()
  clientPhone?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsNotEmpty()
  dueDate: string;
}
