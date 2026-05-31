import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { ScheduleService } from "../services/schedule-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleListSchedules(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const url = new URL(request.url);
  const data = await new ScheduleService(env).listSchedules({ limit: parseOptionalNumber(url.searchParams.get("limit")), offset: parseOptionalNumber(url.searchParams.get("offset")) });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleCreateSchedule(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const input = request.body ? await request.json() as Record<string, unknown> : {};
  const data = await new ScheduleService(env).createSchedule(input, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleEnableSchedule(_request: Request, env: Env, requestId: string, scheduleId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new ScheduleService(env).enableSchedule(scheduleId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDisableSchedule(_request: Request, env: Env, requestId: string, scheduleId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new ScheduleService(env).disableSchedule(scheduleId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleEnableAllSchedules(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new ScheduleService(env).enableAllSchedules({ requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDisableAllSchedules(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new ScheduleService(env).disableAllSchedules({ requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleUpdateSchedule(request: Request, env: Env, requestId: string, scheduleId: number): Promise<Response> {
  ensureDb(env, requestId);
  const input = request.body ? await request.json() as Record<string, unknown> : {};
  const data = await new ScheduleService(env).updateSchedule(scheduleId, input, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDeleteSchedule(_request: Request, env: Env, requestId: string, scheduleId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new ScheduleService(env).deleteSchedule(scheduleId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return Number(value);
}
function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}
