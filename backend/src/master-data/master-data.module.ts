import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RulesModule } from "../rules/rules.module";
import { MasterDataController } from "./master-data.controller";
import { MasterDataService } from "./master-data.service";

/** Canonical schools, academic periods, classes, teachers, subjects and rooms boundary. */
@Module({
  imports: [DatabaseModule, RulesModule],
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
