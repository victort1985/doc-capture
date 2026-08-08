import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { DealStage } from '../entities/deal.entity';
import { InteractionType } from '../entities/deal-interaction.entity';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsString()
  @IsOptional()
  clientPhone?: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @IsNumber()
  @IsOptional()
  estimatedValue?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  assignedToId?: number;
}

export class UpdateDealDto {
  @IsString()
  @IsOptional()
  clientName?: string;

  @IsString()
  @IsOptional()
  clientPhone?: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @IsNumber()
  @IsOptional()
  estimatedValue?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  assignedToId?: number;
}

export class AddInteractionDto {
  @IsEnum(InteractionType)
  type: InteractionType;

  @IsString()
  @IsNotEmpty()
  text: string;
}
