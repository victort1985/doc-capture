import { IsNotEmpty, IsString } from 'class-validator';

export class SaveAsTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateName: string;
}
