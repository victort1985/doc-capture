import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CalendarEventRepeat, CalendarEventType } from '../entities/calendar-event.entity';

export class CreateEventDto {
  @IsEnum(CalendarEventType)
  @IsOptional()
  type?: CalendarEventType;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsBoolean()
  @IsOptional()
  allDay?: boolean;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsEnum(CalendarEventRepeat)
  @IsOptional()
  repeat?: CalendarEventRepeat;

  @IsString()
  @IsOptional()
  technicalRequirements?: string;

  @IsString()
  @IsOptional()
  requiredEquipment?: string;
}
