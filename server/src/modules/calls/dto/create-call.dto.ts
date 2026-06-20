import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { CallUrgency } from '../entities/service-call.entity';

export class CreateCallDto {
  @IsString()
  @MinLength(1)
  place: string;

  // Optional FK into the shared locations directory — when set, the
  // server uses the location's name for `place` instead of trusting the
  // client-typed string, keeping the two in sync. Left optional so the
  // free-text flow still works for a place not yet in the directory.
  @IsInt()
  @IsOptional()
  locationId?: number;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsEnum(CallUrgency)
  urgency: CallUrgency;

  @IsString()
  @MinLength(1)
  contactName: string;

  @IsString()
  @MinLength(1)
  contactPosition: string;

  @IsString()
  @MinLength(1)
  contactPhone: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsBoolean()
  @IsOptional()
  unusualDamage?: boolean;
}
