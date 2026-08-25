import { Body, Controller, Get, Headers, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../auth/auth.guard";
import { ImportsService, MAX_WORKBOOK_SIZE_BYTES, type UploadedExcelFile } from "./imports.service";
import { ImportPreviewDto } from "./import-preview.dto";

@Controller("imports")
@UseGuards(AuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post("preview")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_WORKBOOK_SIZE_BYTES },
    }),
  )
  preview(
    @UploadedFile() file: UploadedExcelFile | undefined,
    @Body() body: ImportPreviewDto,
    @Headers("x-user-id") actorId?: string,
  ) {
    return this.imports.preview(file, body.schoolId, actorId || "local-qc-user");
  }

  @Post(":batchId/confirm")
  confirm(
    @Param("batchId") batchId: string,
    @Headers("x-user-id") actorId: string | undefined,
    @Headers("x-school-id") schoolId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-import-token") importToken: string | undefined,
  ) {
    return this.imports.confirm(batchId, actorId || "local-qc-user", schoolId, idempotencyKey || importToken);
  }

  @Get(":batchId")
  getBatch(@Param("batchId") batchId: string, @Headers("x-school-id") schoolId: string) {
    return this.imports.getBatch(batchId, schoolId);
  }

  @Get(":batchId/audit")
  getAudit(@Param("batchId") batchId: string, @Headers("x-school-id") schoolId: string) {
    return this.imports.getAudit(batchId, schoolId);
  }
}
