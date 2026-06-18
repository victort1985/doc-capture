import { IsOptional, IsString } from 'class-validator';

export class AddNoteDto {
  @IsString()
  @IsOptional()
  text?: string;
}
