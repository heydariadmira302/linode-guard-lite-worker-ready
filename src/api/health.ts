import type { Env } from "../env";
import { createJsonResponse } from "../utils/json-response";

export function handleHealth(_request: Request, _env: Env, requestId: string): Response {
  return createJsonResponse({ ok: true, data: { service: "linode-guard-lite", version: "0.1.0", time: new Date().toISOString() } }, { requestId });
}
