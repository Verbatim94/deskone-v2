import { publicEnv } from "@/app/config/env";

type EdgeClientOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  sessionToken?: string | null;
  signal?: AbortSignal;
};

export class EdgeClientError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "EdgeClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export async function invokeEdgeFunction<TResponse>(
  functionName: string,
  options: EdgeClientOptions = {},
): Promise<TResponse> {
  if (!publicEnv.isConfigured) {
    throw new EdgeClientError(500, "env_not_configured", "Public environment variables are not fully configured.");
  }

  const headers = new Headers({
    apikey: publicEnv.supabasePublishableKey,
    "Content-Type": "application/json",
  });

  if (options.sessionToken) {
    headers.set("Authorization", `Bearer ${options.sessionToken}`);
  }

  const requestUrl = new URL(`${publicEnv.supabaseUrl}/functions/v1/${functionName}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      requestUrl.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(requestUrl, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    let parsedError: ErrorEnvelope | null = null;

    try {
      parsedError = (await response.json()) as ErrorEnvelope;
    } catch {
      parsedError = null;
    }

    throw new EdgeClientError(
      response.status,
      parsedError?.error?.code ?? "request_failed",
      parsedError?.error?.message ?? "Request failed.",
      parsedError?.error?.details,
    );
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
