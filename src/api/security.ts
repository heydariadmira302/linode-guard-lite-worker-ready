import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { SecurityService } from "../services/security-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleListSecurityEvents(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const url = new URL(request.url);
  const params = {
    limit: parseOptionalNumber(url.searchParams.get("limit")),
    offset: parseOptionalNumber(url.searchParams.get("offset")),
    status: url.searchParams.get("status"),
    type: url.searchParams.get("type"),
    account_id: parseOptionalNumber(url.searchParams.get("account_id"))
  };
  const data = await new SecurityService(env).listSecurityEvents(params);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleSecurityCheck(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new SecurityService(env).checkAccounts({ requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleConfirmSecurityEvent(_request: Request, env: Env, requestId: string, eventId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new SecurityService(env).updateSecurityEventStatus(eventId, "confirmed", { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleMarkSecurityEventSuspicious(_request: Request, env: Env, requestId: string, eventId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new SecurityService(env).updateSecurityEventStatus(eventId, "suspicious", { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return Number(value);
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
