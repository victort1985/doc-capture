import { IsIn, IsString } from 'class-validator';

export class UploadFilesDto {
  @IsString()
  place: string;

  @IsIn(['document', 'photo'])
  docType: 'document' | 'photo';
}
