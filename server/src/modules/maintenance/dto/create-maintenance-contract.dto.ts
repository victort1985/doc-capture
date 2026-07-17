import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { MaintenanceFrequency } from '../entities/maintenance-contract.entity';
import { CallUrgency } from '../../calls/entities/service-call.entity';

export class CreateMaintenanceContractDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsInt()
  locationId: number;

  @IsEnum(MaintenanceFrequency)
  frequency: MaintenanceFrequency;

  @IsString()
  nextRunDate: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(CallUrgency)
  @IsOptional()
  urgency?: CallUrgency;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
