import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { WindowsInstanceService } from "../services/windows-instance-service";
import { WindowsVersionService, type WindowsLanguageId, type WindowsVersionId } from "../services/windows-version-service";
import { createJsonResponse } from "../utils/json-response";

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}

export async function handleGetWindowsVersions(_request: Request, _env: Env, requestId: string): Promise<Response> {
  const service = new WindowsVersionService();
  return createJsonResponse({ ok: true, data: { versions: service.listVersions(), languages: service.listLanguages() } }, { requestId });
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

export async function handleGetWindowsCreateOptions(request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const url = new URL(request.url);
  const data = await new WindowsInstanceService(env).getCreateOptions(accountId, requestId, {
    version: (url.searchParams.get("version") || undefined) as WindowsVersionId | undefined,
    lang: (url.searchParams.get("lang") || undefined) as WindowsLanguageId | undefined
  });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleCreateWindowsInstance(request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data = await new WindowsInstanceService(env).createWindowsInstance(accountId, {
    region: String(body.region ?? ""),
    type: String(body.type ?? ""),
    label: typeof body.label === "string" ? body.label : undefined,
    firewall_id: body.firewall_id === null || body.firewall_id === undefined ? null : Number(body.firewall_id),
    version: typeof body.version === "string" ? body.version as WindowsVersionId : undefined,
    lang: typeof body.lang === "string" ? body.lang as WindowsLanguageId : undefined,
    administrator_password: typeof body.administrator_password === "string" ? body.administrator_password : undefined,
    windows_username: typeof body.windows_username === "string" ? body.windows_username : undefined
  }, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}
