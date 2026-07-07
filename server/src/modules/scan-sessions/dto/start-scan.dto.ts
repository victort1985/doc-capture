import { IsIn, IsString } from 'class-validator';

export class StartScanDto {
  @IsString()
  place: string;

  @IsIn(['document', 'photo'])
  docType: 'document' | 'photo';
}
