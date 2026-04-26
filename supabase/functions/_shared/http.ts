import { buildCorsHeaders } from "./cors.ts";

export type ErrorCode =
  | "bad_request"
  | "invalid_credentials"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "internal_error";

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildResponseHeaders(req: Request, headers: HeadersInit = {}) {
  return {
    ...buildCorsHeaders(req),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  };
}

export function jsonResponse(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: buildResponseHeaders(req, {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    }),
  });
}

export async function withJsonHandler(
  req: Request,
  handler: () => Promise<Response>,
) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(req) });
  }

  try {
    return await handler();
  } catch (error) {
    console.error("Edge function error", error);

    if (error instanceof HttpError) {
      return new Response(
        JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }),
        {
          status: error.status,
          headers: buildResponseHeaders(req, {
            "Content-Type": "application/json",
          }),
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          code: "internal_error",
          message: "Unexpected server error.",
        },
      }),
      {
        status: 500,
        headers: buildResponseHeaders(req, {
          "Content-Type": "application/json",
        }),
      },
    );
  }
}
