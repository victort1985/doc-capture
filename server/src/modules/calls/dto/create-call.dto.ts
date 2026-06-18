import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { CallUrgency } from '../entities/service-call.entity';

export class CreateCallDto {
  @IsString()
  @MinLength(1)
  place: string;

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
