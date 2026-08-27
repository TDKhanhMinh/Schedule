import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MasterDataImportController } from "./master-data-import.controller";
import { MasterDataImportService } from "./master-data-import.service";

@Module({
  imports: [DatabaseModule],
  controllers: [MasterDataImportController],
  providers: [MasterDataImportService],
  exports: [MasterDataImportService],
})
export class MasterDataImportModule {}
