import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { WindowsInstanceService } from "../services/windows-instance-service";
import { createJsonResponse } from "../utils/json-response";

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}

export async function handleGetWindowsStackScriptStatus(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new WindowsInstanceService(env).getStatus(accountId, requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleEnsureWindowsStackScript(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new WindowsInstanceService(env).ensureStackScript(accountId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleGetWindowsCreateOptions(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new WindowsInstanceService(env).getCreateOptions(accountId, requestId);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleCreateWindowsInstance(request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data = await new WindowsInstanceService(env).createWindowsInstance(accountId, {
    region: String(body.region ?? ""),
    type: String(body.type ?? ""),
    label: typeof body.label === "string" ? body.label : undefined,
    firewall_id: body.firewall_id === null || body.firewall_id === undefined ? null : Number(body.firewall_id)
  }, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}
