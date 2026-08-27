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
import { RequirePermission } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import { MAX_WORKBOOK_SIZE_BYTES, type UploadedExcelFile } from "../imports/imports.service";
import { MasterDataImportPreviewDto } from "./master-data-import.dto";
import { MasterDataImportService } from "./master-data-import.service";

@Controller("schools/:schoolId/master-data-imports")
@UseGuards(AuthGuard)
export class MasterDataImportController {
  constructor(private readonly imports: MasterDataImportService) {}

  @Get("templates/:entity")
  async template(@Param("schoolId") schoolId: string, @Param("entity") entity: string, @Res() response: Response) {
    const result = await this.imports.buildTemplate(schoolId, entity);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.workbook);
  }

  @Post("preview")
  @RequirePermission("IMPORT")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_WORKBOOK_SIZE_BYTES } }))
  preview(
    @Param("schoolId") schoolId: string,
    @UploadedFile() file: UploadedExcelFile | undefined,
    @Body() body: MasterDataImportPreviewDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.imports.preview(file, schoolId, body.entity, request.auth!.userId);
  }

  @Get(":batchId")
  getBatch(@Param("schoolId") schoolId: string, @Param("batchId") batchId: string) {
    return this.imports.getBatch(batchId, schoolId);
  }

  @Post(":batchId/confirm")
  @RequirePermission("IMPORT")
  confirm(
    @Param("schoolId") schoolId: string,
    @Param("batchId") batchId: string,
    @Req() request: RequestWithAuth,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-import-token") importToken: string | undefined,
  ) {
    return this.imports.confirm(batchId, schoolId, request.auth!.userId, idempotencyKey || importToken);
  }

  @Get(":batchId/error-report")
  async errorReport(@Param("schoolId") schoolId: string, @Param("batchId") batchId: string, @Res() response: Response) {
    const result = await this.imports.buildErrorReport(batchId, schoolId);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.workbook);
  }
}
