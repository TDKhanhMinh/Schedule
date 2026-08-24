import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { OptimizationQueueService } from "./optimization-queue.service";
import { SolveJobDto } from "./solve-job.dto";

@Controller("optimization-jobs")
export class OptimizationJobsController {
  constructor(private readonly queue: OptimizationQueueService) {}

  @Post()
  enqueue(@Body() payload: SolveJobDto) {
    return this.queue.enqueue(payload);
  }

  @Get(":jobId")
  getStatus(@Param("jobId") jobId: string) {
    return this.queue.getStatus(jobId);
  }
}
