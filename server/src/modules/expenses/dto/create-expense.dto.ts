import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

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

  /** See Expense.vatAmount's own doc comment — optional, how much of
   * `amount` is VAT. */
  @IsNumber()
  @IsOptional()
  vatAmount?: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @IsOptional()
  cardLast4?: string;

  @IsString()
  @IsOptional()
  cardType?: string;

  @IsString()
  @IsOptional()
  approvalNumber?: string;

  @IsInt()
  @IsOptional()
  installments?: number;

  @IsString()
  @IsOptional()
  checkNumber?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  branchNumber?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  checkDate?: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsInt()
  @IsOptional()
  costCenterId?: number;
}
