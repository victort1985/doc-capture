import { IsInt, IsString, MinLength } from 'class-validator';

export class CreateCityDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  regionId: number;
}
