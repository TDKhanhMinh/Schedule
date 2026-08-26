import { Controller, Get, Header } from "@nestjs/common";
import { ObservabilityService } from "./observability.service";

@Controller("metrics")
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metrics() {
    return this.observability.toPrometheus();
  }
}
