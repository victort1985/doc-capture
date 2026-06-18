import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateClientStorageSettingsDto {
  @IsNumber()
  @IsOptional()
  documentStorageConnectionId?: number;

  @IsNumber()
  @IsOptional()
  photoStorageConnectionId?: number;

  @IsString()
  @IsOptional()
  documentSubfolderPattern?: string;

  @IsString()
  @IsOptional()
  photoSubfolderPattern?: string;
}
