import { ErrorCode } from "./error-codes";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly request_id: string,
    public readonly status = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }

  toResponseBody() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.message,
        request_id: this.request_id
      }
    };
  }
}
