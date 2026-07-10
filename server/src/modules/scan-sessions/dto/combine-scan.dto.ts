import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { RenderScanDto } from './render-scan.dto';

/** One page's session id plus whatever corners/filter settings the user
 * landed on for that specific page during review. */
export class CombinePageDto extends RenderScanDto {
  @IsInt()
  sessionId: number;
}

/** Merges multiple already-reviewed scan sessions (each one page) into a
 * single multi-page PDF and commits it as one document — the batch-
 * capture flow (spec: "пакетная сьемка... в один файл несколько
 * страниц"). */
export class CombineScanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CombinePageDto)
  pages: CombinePageDto[];

  @IsString()
  place: string;

  @IsIn(['document', 'photo'])
  docType: 'document' | 'photo';

  // If left blank, the existing template-based naming pattern is used
  // instead — spec: "если оно не будет указано в сканере то действовать
  // по шаблону, но если имя указывается вручную то именно это название
  // и будет именем документа".
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customName?: string;
}
