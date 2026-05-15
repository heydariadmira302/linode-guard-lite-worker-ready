import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { DiagnosticsService, SetupService } from "../services/setup-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleDeploymentDiagnostics(_request: Request, env: Env, requestId: string): Promise<Response> {
  const data = await new DiagnosticsService(env).getDeploymentDiagnostics();
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleJobsDiagnostics(_request: Request, env: Env, requestId: string): Promise<Response> {
  const data = await new DiagnosticsService(env).getJobsDiagnostics();
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleSetupSchema(_request: Request, env: Env, requestId: string): Promise<Response> {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
  const data = await new SetupService(env).initializeSchema();
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleSetupInitialize(_request: Request, env: Env, requestId: string): Promise<Response> {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
  const data = await new SetupService(env).initializeDefaults();
  return createJsonResponse({ ok: true, data }, { requestId });
}
