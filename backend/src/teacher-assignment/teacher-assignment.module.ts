import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RulesModule } from "../rules/rules.module";
import { TeacherAssignmentController } from "./teacher-assignment.controller";
import { TeacherAssignmentRunStore } from "./teacher-assignment-run.store";
import { TeacherAssignmentService } from "./teacher-assignment.service";

@Module({
  imports: [DatabaseModule, RulesModule],
  controllers: [TeacherAssignmentController],
  providers: [TeacherAssignmentRunStore, TeacherAssignmentService],
  exports: [TeacherAssignmentService],
})
export class TeacherAssignmentModule {}
