import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
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
    @Req() request: RequestWithAuth,
  ) {
    return this.imports.preview(file, body.schoolId, request.auth!.userId);
  }

  @Get("template")
  async template(@Req() request: RequestWithAuth, @Res() response: Response) {
    const result = await this.imports.buildTemplate(request.auth!.schoolId);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.setHeader("X-Template-Version", result.templateVersion);
    response.send(result.workbook);
  }

  @Post(":batchId/confirm")
  confirm(
    @Param("batchId") batchId: string,
    @Req() request: RequestWithAuth,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-import-token") importToken: string | undefined,
  ) {
    return this.imports.confirm(batchId, request.auth!.userId, request.auth!.schoolId, idempotencyKey || importToken);
  }

  @Get(":batchId")
  getBatch(@Param("batchId") batchId: string, @Req() request: RequestWithAuth) {
    return this.imports.getBatch(batchId, request.auth!.schoolId);
  }

  @Get(":batchId/error-report")
  async errorReport(@Param("batchId") batchId: string, @Req() request: RequestWithAuth, @Res() response: Response) {
    const workbook = await this.imports.buildErrorReport(batchId, request.auth!.schoolId);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="import-error-report-${batchId}.xlsx"`);
    response.send(workbook);
  }

  @Get(":batchId/audit")
  getAudit(@Param("batchId") batchId: string, @Req() request: RequestWithAuth) {
    return this.imports.getAudit(batchId, request.auth!.schoolId);
  }
}
