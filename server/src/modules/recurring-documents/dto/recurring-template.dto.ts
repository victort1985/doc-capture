import { IsEnum, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { RecurringDocumentType } from '../../accounting/entities/recurring-template.entity';

export class CreateRecurringTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(RecurringDocumentType)
  documentType: RecurringDocumentType;

  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth: number;

  /** Validated against CreateExpenseDto/CreateInvoiceDto's own rules
   * server-side before saving — see RecurringDocumentsService.create. */
  @IsObject()
  templateData: Record<string, unknown>;
}

export class UpdateRecurringTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @Max(28)
  @IsOptional()
  dayOfMonth?: number;

  @IsObject()
  @IsOptional()
  templateData?: Record<string, unknown>;

  @IsIn([true, false])
  @IsOptional()
  active?: boolean;
}
