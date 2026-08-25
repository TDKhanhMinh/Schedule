import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { OptimizationQueueService } from "./optimization-queue.service";
import { SolveJobDto } from "./solve-job.dto";

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
  getStatus(@Param("jobId") jobId: string) {
    return this.queue.getStatus(jobId);
  }
}
