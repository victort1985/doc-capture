import { PartialType } from '@nestjs/mapped-types';
import { CreateStorageConnectionDto } from './create-storage-connection.dto';

export class UpdateStorageConnectionDto extends PartialType(CreateStorageConnectionDto) {}
