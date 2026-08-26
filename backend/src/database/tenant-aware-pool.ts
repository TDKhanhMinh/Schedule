import { Pool, type PoolClient } from "pg";
import { tenantContext } from "./tenant-context";

const TENANT_SETTING_QUERY = "SELECT set_config('app.tenant_id', $1, true)";

export interface TenantAwarePoolOptions {
  enforceTenantContext?: boolean;
}

type QueryInvoker = (...args: unknown[]) => Promise<unknown>;

function queryText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "");
  }
  return "";
}

function commandOf(value: unknown) {
  return queryText(value).trim().split(/\s+/u)[0]?.toUpperCase() ?? "";
}

function invoke(query: QueryInvoker, args: unknown[]) {
  return query(...args);
}

function wrapClient(client: PoolClient): PoolClient {
  const rawQuery = client.query.bind(client) as unknown as QueryInvoker;
  const rawRelease = client.release.bind(client);
  let transactionOpen = false;
  let scopedTenantId: string | undefined;

  const wrapped = Object.create(client) as PoolClient;
  wrapped.query = (async (...args: unknown[]) => {
    const command = commandOf(args[0]);
    const currentTenantId = tenantContext.get();

    if (command === "BEGIN") {
      const result = await invoke(rawQuery, args);
      transactionOpen = true;
      scopedTenantId = currentTenantId;
      if (currentTenantId) await rawQuery(TENANT_SETTING_QUERY, [currentTenantId]);
      return result;
    }

    if (command === "COMMIT" || command === "ROLLBACK") {
      const result = await invoke(rawQuery, args);
      transactionOpen = false;
      scopedTenantId = undefined;
      return result;
    }

    if (!currentTenantId) return invoke(rawQuery, args);
    if (transactionOpen && scopedTenantId !== currentTenantId) {
      throw new Error("TENANT_CONTEXT_CHANGED_DURING_TRANSACTION");
    }

    if (transactionOpen) return invoke(rawQuery, args);

    await rawQuery("BEGIN");
    await rawQuery(TENANT_SETTING_QUERY, [currentTenantId]);
    try {
      const result = await invoke(rawQuery, args);
      await rawQuery("COMMIT");
      return result;
    } catch (error) {
      await rawQuery("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }) as PoolClient["query"];
  wrapped.release = rawRelease;
  return wrapped;
}

export function createTenantAwarePool(connectionString: string, options: TenantAwarePoolOptions = {}) {
  const pool = new Pool({ connectionString });
  const rawConnect = pool.connect.bind(pool) as unknown as () => Promise<PoolClient>;

  pool.connect = (async () => wrapClient(await rawConnect())) as unknown as Pool["connect"];
  pool.query = (async (...args: unknown[]) => {
    const currentTenantId = tenantContext.get();
    const client = await rawConnect();
    try {
      if (currentTenantId && options.enforceTenantContext !== false) {
        await client.query("BEGIN");
        await client.query(TENANT_SETTING_QUERY, [currentTenantId]);
        const result = await (client.query as unknown as QueryInvoker)(...args);
        await client.query("COMMIT");
        return result;
      }
      return (client.query as unknown as QueryInvoker)(...args);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }) as unknown as Pool["query"];

  return pool;
}
