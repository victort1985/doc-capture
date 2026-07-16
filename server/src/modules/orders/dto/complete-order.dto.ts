import { IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteOrderDto {
  @IsString()
  @MinLength(1)
  invoiceNumber: string;

  @IsOptional()
  @IsString()
  description?: string;
}
