import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ImportsService, type UploadedExcelFile } from "./imports.service";

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post("preview")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_IMPORT_FILE_SIZE }
    })
  )
  preview(
    @UploadedFile() file: UploadedExcelFile | undefined,
    @Body("schoolId") schoolId: string,
    @Headers("x-user-id") actorId?: string
  ) {
    return this.imports.preview(file, schoolId, actorId || "local-qc-user");
  }

  @Post(":batchId/confirm")
  confirm(@Param("batchId") batchId: string, @Headers("x-user-id") actorId?: string) {
    return this.imports.confirm(batchId, actorId || "local-qc-user");
  }

  @Get(":batchId")
  getBatch(@Param("batchId") batchId: string) {
    return this.imports.getBatch(batchId);
  }

  @Get(":batchId/audit")
  getAudit(@Param("batchId") batchId: string) {
    return this.imports.getAudit(batchId);
  }
}
