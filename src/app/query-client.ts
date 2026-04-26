import { QueryClient } from "@tanstack/react-query";

type RetryableError = {
  status?: number;
};

function shouldRetryRequest(failureCount: number, error: RetryableError) {
  if (error.status === 401 || error.status === 403) {
    return false;
  }

  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryRequest,
    },
    mutations: {
      retry: false,
    },
  },
});
