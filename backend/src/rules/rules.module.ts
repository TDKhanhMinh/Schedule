import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TeacherLoadController } from "./teacher-load.controller";
import { TeacherLoadCalculationService, TeacherLoadService } from "./teacher-load.service";
import { TeacherAvailabilityController } from "./teacher-availability.controller";
import { TeacherAvailabilityCalculationService, TeacherAvailabilityService } from "./teacher-availability.service";
import { RuleManagementController } from "./rule-management.controller";
import { RuleManagementService } from "./rule-management.service";

/** Versioned rule profiles and provenance boundary; solver rules stay in Python. */
@Module({
  imports: [DatabaseModule],
  controllers: [TeacherLoadController, TeacherAvailabilityController, RuleManagementController],
  providers: [
    TeacherLoadCalculationService,
    TeacherLoadService,
    TeacherAvailabilityCalculationService,
    TeacherAvailabilityService,
    RuleManagementService,
  ],
  exports: [
    TeacherLoadCalculationService,
    TeacherLoadService,
    TeacherAvailabilityCalculationService,
    TeacherAvailabilityService,
    RuleManagementService,
  ],
})
export class RulesModule {}
