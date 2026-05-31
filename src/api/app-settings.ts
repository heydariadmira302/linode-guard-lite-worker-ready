import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AppSettingsService, type AppSettings, type ProtectedInstanceRule } from "../services/app-settings-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleGetAppSettings(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const settings = await new AppSettingsService(env).getSettings();
  return createJsonResponse({ ok: true, data: { settings } }, { requestId });
}

export async function handleUpdateAppSettings(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as Partial<AppSettings>;
  const settings = await new AppSettingsService(env).updateSettings(body);
  return createJsonResponse({ ok: true, data: { settings } }, { requestId });
}

export async function handleAddProtectedInstance(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as ProtectedInstanceRule;
  const settings = await new AppSettingsService(env).addProtectedInstance(body);
  return createJsonResponse({ ok: true, data: { settings } }, { requestId });
}

export async function handleRemoveProtectedInstance(_request: Request, env: Env, requestId: string, index: number): Promise<Response> {
  ensureDb(env, requestId);
  const settings = await new AppSettingsService(env).removeProtectedInstance(index);
  return createJsonResponse({ ok: true, data: { settings } }, { requestId });
}

async function readJsonBody(request: Request, requestId: string): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid JSON body", requestId, 400);
  }
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
