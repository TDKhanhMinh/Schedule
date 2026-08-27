import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { validateEnvironment } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { ImportsModule } from "./imports/imports.module";
import { JobsModule } from "./jobs/jobs.module";
import { MasterDataModule } from "./master-data/master-data.module";
import { MasterDataImportModule } from "./master-data-import/master-data-import.module";
import { RulesModule } from "./rules/rules.module";
import { TimetableModule } from "./timetable/timetable.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    MasterDataModule,
    MasterDataImportModule,
    ImportsModule,
    RulesModule,
    TimetableModule,
    JobsModule,
    HealthModule,
    DatabaseModule,
    ObservabilityModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
