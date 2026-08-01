import { PartialType } from '@nestjs/mapped-types';
import { CreateQuoteDto } from './create-quote.dto';

export class CreateFromTemplateDto extends PartialType(CreateQuoteDto) {}
