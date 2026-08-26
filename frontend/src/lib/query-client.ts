import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) =>
        error instanceof Error && "status" in error && Number(error.status) < 500 && failureCount < 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});
