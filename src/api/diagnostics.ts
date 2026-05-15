import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import type { RuntimeSecrets } from "../services/runtime-secret-service";
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

export async function handleSetupInitialize(request: Request, env: Env, requestId: string): Promise<Response> {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
  const manualSecrets = await readManualSecrets(request);
  const data = await new SetupService(env).initializeDefaults(manualSecrets);
  return createJsonResponse({ ok: true, data }, { requestId });
}

async function readManualSecrets(request: Request): Promise<Partial<RuntimeSecrets>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const body = await request.json().catch(() => ({})) as { runtime_secrets?: Partial<RuntimeSecrets> };
  return body.runtime_secrets ?? {};
}
