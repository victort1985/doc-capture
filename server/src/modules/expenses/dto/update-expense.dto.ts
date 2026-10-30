import { PartialType } from '@nestjs/mapped-types';
import { CreateExpenseDto } from './create-expense.dto';

/** Every field optional — only the ones the client sends are changed.
 * An empty string / null clears an optional text field. */
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}
