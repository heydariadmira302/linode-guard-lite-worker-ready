import type { AppError } from "../errors/app-error";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; request_id: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createJsonResponse<T>(body: ApiResponse<T>, init: { status?: number; requestId: string }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": init.requestId
    }
  });
}

export function createErrorResponse(error: AppError): Response {
  return createJsonResponse(error.toResponseBody(), { status: error.status, requestId: error.request_id });
}
