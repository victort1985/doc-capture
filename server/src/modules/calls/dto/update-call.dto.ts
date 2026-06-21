import { PartialType } from '@nestjs/mapped-types';
import { CreateCallDto } from './create-call.dto';

/** Admin-only general edit (place, contact info, urgency, description, etc.) — distinct from UpdateCallStatusDto, which is the normal open/in-progress/closed flow any user can trigger. */
export class UpdateCallDto extends PartialType(CreateCallDto) {}
