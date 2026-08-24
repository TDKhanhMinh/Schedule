import { IsNotEmpty, IsString } from "class-validator";

export class ImportPreviewDto {
  @IsString()
  @IsNotEmpty()
  schoolId!: string;
}
