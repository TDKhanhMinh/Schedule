import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateScheduleAssignmentDto {
  @IsString()
  @IsNotEmpty()
  timeSlotId!: string;

  @IsString()
  @IsOptional()
  roomId?: string | null;
}
