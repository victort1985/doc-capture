import { IsEnum, IsIn, Matches, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export const EXPENSE_DOCUMENT_TYPES = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'invoice', 'credit_note', 'cash_slip', 'other'];

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

  @IsString() @IsOptional()
  transactionDate?: string;

  @IsString() @IsOptional()
  vendorName?: string;

  @IsString() @IsOptional()
  vendorTaxId?: string;

  @IsIn(EXPENSE_DOCUMENT_TYPES) @IsOptional()
  documentType?: string;

  @IsString() @IsOptional()
  documentNumber?: string;

  @IsString() @IsOptional()
  allocationNumber?: string;

  @IsNumber() @IsOptional()
  vatRate?: number;

  @IsNumber() @IsOptional()
  vatDeductiblePercent?: number;

  @Matches(/^[A-Z]{3}$/) @IsOptional()
  currency?: string;

  @IsNumber() @IsOptional()
  foreignAmount?: number;

  @IsNumber() @IsOptional()
  exchangeRate?: number;

  @IsNumber() @IsOptional()
  withholdingTaxAmount?: number;

  @IsString() @IsOptional()
  scanLanguage?: string;
}
