import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';

export class CreatePaymentDto {
  @IsString()
  clientName: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Links this payment to the invoice it settles — inherits that
   * invoice's chain instead of starting a new one. */
  @IsInt()
  @IsOptional()
  invoiceId?: number;

  @IsString()
  @IsOptional()
  chainId?: string;
}
