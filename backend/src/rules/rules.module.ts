import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TeacherLoadController } from "./teacher-load.controller";
import { TeacherLoadCalculationService, TeacherLoadService } from "./teacher-load.service";

/** Versioned rule profiles and provenance boundary; solver rules stay in Python. */
@Module({
  imports: [DatabaseModule],
  controllers: [TeacherLoadController],
  providers: [TeacherLoadCalculationService, TeacherLoadService],
  exports: [TeacherLoadCalculationService, TeacherLoadService],
})
export class RulesModule {}
