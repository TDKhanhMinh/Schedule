import { AsyncLocalStorage } from "node:async_hooks";

const tenantStorage = new AsyncLocalStorage<string | undefined>();

export const tenantContext = {
  get(): string | undefined {
    return tenantStorage.getStore();
  },

  run<T>(tenantId: string | undefined, callback: () => T): T {
    return tenantStorage.run(tenantId, callback);
  },
};
