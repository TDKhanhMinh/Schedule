import { Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { createTenantAwarePool } from "./tenant-aware-pool";

export const PG_POOL = "PG_POOL";

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createTenantAwarePool(config.getOrThrow<string>("DATABASE_URL"), {
          enforceTenantContext: config.get<string>("TENANT_DB_ENFORCEMENT", "false") === "true",
        }),
    },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
