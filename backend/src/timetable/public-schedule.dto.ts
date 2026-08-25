import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SCHEDULE_PUBLIC_VIEWS, type SchedulePublicView } from "../contracts";

export class PublicScheduleQueryDto {
  @IsIn(SCHEDULE_PUBLIC_VIEWS)
  @IsOptional()
  view: SchedulePublicView = "all";

  @IsString()
  @MaxLength(128)
  @IsOptional()
  resource?: string;
}

export class CreatePublicScheduleLinkDto {
  @IsInt()
  @Min(1)
  @Max(720)
  @IsOptional()
  expiresInHours = 168;
}
