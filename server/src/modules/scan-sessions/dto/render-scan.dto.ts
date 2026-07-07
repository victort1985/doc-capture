import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { PointDto } from './point.dto';

/** Shared body shape for both the live-preview and finalize endpoints —
 * whatever renders the preview is exactly what finalize commits, so
 * there's no risk of the confirmed file looking different from the last
 * thing the user saw. */
export class RenderScanDto {
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  corners: PointDto[];

  @IsIn(['original', 'bw'])
  filter: 'original' | 'bw';

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  brightness?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  contrast?: number;

  @IsOptional()
  @IsBoolean()
  removeShadows?: boolean;
}
