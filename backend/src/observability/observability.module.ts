import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityInterceptor } from "./observability.interceptor";
import { ObservabilityService } from "./observability.service";

@Global()
@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService, { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor }],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
