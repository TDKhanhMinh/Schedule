import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import { OptimizationQueueService } from "./optimization-queue.service";
import { CancelOptimizationJobDto, SolveJobDto } from "./solve-job.dto";

@Controller("optimization-jobs")
@UseGuards(AuthGuard)
export class OptimizationJobsController {
  constructor(private readonly queue: OptimizationQueueService) {}

  @Post("preflight")
  preflight(@Body() payload: SolveJobDto) {
    return this.queue.preflight(payload);
  }

  @Post()
  enqueue(@Body() payload: SolveJobDto) {
    return this.queue.enqueue(payload);
  }

  @Get(":jobId")
  getStatus(@Param("jobId") jobId: string, @Req() request: RequestWithAuth) {
    return this.queue.getStatus(jobId, request.auth!.schoolId);
  }

  @Post(":jobId/cancel")
  cancel(@Param("jobId") jobId: string, @Req() request: RequestWithAuth, @Body() payload: CancelOptimizationJobDto) {
    return this.queue.cancel(jobId, request.auth!.schoolId, payload.reason);
  }

  @Post(":jobId/retry")
  retry(
    @Param("jobId") jobId: string,
    @Req() request: RequestWithAuth,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.queue.retry(jobId, request.auth!.schoolId, idempotencyKey);
  }
}
