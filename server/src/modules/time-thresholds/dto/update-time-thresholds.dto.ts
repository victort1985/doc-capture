import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTimeThresholdsDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  callsWarningHours?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  callsDangerHours?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  vehicleWarningDays?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  vehicleDangerDays?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rentalWarningDays?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rentalDangerDays?: number;
}
