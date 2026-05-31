import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { InstanceService } from "../services/instance-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleListAllInstances(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).listAllActiveAccountInstances(requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleListAccountInstances(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).listAccountInstances(accountId, requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleGetAccountInstance(_request: Request, env: Env, requestId: string, accountId: number, instanceId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).getAccountInstance(accountId, instanceId, requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleBootAccountInstance(_request: Request, env: Env, requestId: string, accountId: number, instanceId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).bootInstance(accountId, instanceId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleShutdownAccountInstance(_request: Request, env: Env, requestId: string, accountId: number, instanceId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).shutdownInstance(accountId, instanceId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleRebootAccountInstance(_request: Request, env: Env, requestId: string, accountId: number, instanceId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).rebootInstance(accountId, instanceId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDeleteAccountInstance(_request: Request, env: Env, requestId: string, accountId: number, instanceId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new InstanceService(env).deleteInstance(accountId, instanceId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
