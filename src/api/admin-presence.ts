import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AdminPresenceService } from "../services/admin-presence-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleAdminPresenceStatus(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).getStatus();
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleAdminPresenceCheckin(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).checkin({ requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleGetAdminPresencePolicy(_request: Request, env: Env, requestId: string, policyId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).getPolicy(policyId, requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleListAdminPresencePolicies(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const url = new URL(request.url);
  const data = await new AdminPresenceService(env).listPolicies({ limit: parseOptionalNumber(url.searchParams.get("limit")), offset: parseOptionalNumber(url.searchParams.get("offset")) });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleCreateAdminPresencePolicy(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const input = await readJson(request);
  const data = await new AdminPresenceService(env).createPolicy(input, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleEnableAdminPresencePolicy(_request: Request, env: Env, requestId: string, policyId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).enablePolicy(policyId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDisableAdminPresencePolicy(_request: Request, env: Env, requestId: string, policyId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).disablePolicy(policyId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDeleteAdminPresencePolicy(_request: Request, env: Env, requestId: string, policyId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AdminPresenceService(env).deletePolicy(policyId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  return await request.json() as Record<string, unknown>;
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return Number(value);
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
