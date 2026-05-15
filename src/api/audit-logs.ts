import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AuditRepository } from "../storage/audit-repository";
import { AuditService } from "../services/audit-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleListAuditLogs(request: Request, env: Env, requestId: string): Promise<Response> {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
  const url = new URL(request.url);
  const limit = parseOptionalNumber(url.searchParams.get("limit"));
  const offset = parseOptionalNumber(url.searchParams.get("offset"));
  const action = url.searchParams.get("action");
  const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs({ limit, offset, action });
  return createJsonResponse({ ok: true, data }, { requestId });
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
