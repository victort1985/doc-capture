import { IsEnum } from 'class-validator';
import { CallStatus } from '../entities/service-call.entity';

export class UpdateCallStatusDto {
  @IsEnum(CallStatus)
  status: CallStatus;
}
