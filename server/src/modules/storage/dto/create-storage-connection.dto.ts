import { IsEnum, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { StorageType } from '../entities/storage-connection.entity';

export class CreateStorageConnectionDto {
  @IsString()
  name: string;

  @IsEnum(StorageType)
  type: StorageType;

  @IsString()
  @IsOptional()
  host?: string;

  @IsNumber()
  @IsOptional()
  port?: number;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  basePath: string;

  @IsObject()
  @IsOptional()
  extraConfig?: Record<string, unknown>;
}
