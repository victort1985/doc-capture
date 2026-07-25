import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn(['cash', 'bank'])
  @IsOptional()
  method?: 'cash' | 'bank';
}
