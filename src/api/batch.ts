import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { BatchService, type BatchAction } from "../services/batch-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleAccountBatch(_request: Request, env: Env, requestId: string, accountId: number, action: BatchAction): Promise<Response> {
  ensureDb(env, requestId);
  const options = await parseBatchOptions(_request, requestId);
  const data = await new BatchService(env).runAccountBatch(accountId, action, { requestId, actor: "api:default", source: "api" }, options);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleGroupBatch(_request: Request, env: Env, requestId: string, groupId: number, action: BatchAction): Promise<Response> {
  ensureDb(env, requestId);
  const options = await parseBatchOptions(_request, requestId);
  const data = await new BatchService(env).runGroupBatch(groupId, action, { requestId, actor: "api:default", source: "api" }, options);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleAllAccountsBatch(_request: Request, env: Env, requestId: string, action: BatchAction): Promise<Response> {
  ensureDb(env, requestId);
  const options = await parseBatchOptions(_request, requestId);
  const data = await new BatchService(env).runAllAccountsBatch(action, { requestId, actor: "api:default", source: "api" }, options);
  return createJsonResponse({ ok: true, data }, { requestId });
}

async function parseBatchOptions(request: Request, requestId: string): Promise<Record<string, never>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const body = await request.json().catch(() => {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid request body", requestId, 400);
  }) as Record<string, unknown>;
  if ("instance_ids" in body) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Batch operations currently support all instances in scope only", requestId, 400);
  }
  return {};
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
