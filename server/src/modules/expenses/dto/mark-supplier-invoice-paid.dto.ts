import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class MarkSupplierInvoicePaidDto {
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
}
