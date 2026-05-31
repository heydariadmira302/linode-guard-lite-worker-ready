import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { GroupService } from "../services/group-service";
import { createJsonResponse } from "../utils/json-response";

export async function handleListGroups(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new GroupService(env).listGroups();
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleCreateGroup(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as { name?: unknown };
  const group = await new GroupService(env).createGroup(String(body.name ?? ""), { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data: group }, { requestId });
}

export async function handleRenameGroup(request: Request, env: Env, requestId: string, groupId: number): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as { name?: unknown };
  const group = await new GroupService(env).renameGroup(groupId, String(body.name ?? ""), { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data: group }, { requestId });
}

export async function handleDeleteGroup(_request: Request, env: Env, requestId: string, groupId: number): Promise<Response> {
  ensureDb(env, requestId);
  const group = await new GroupService(env).deleteGroup(groupId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data: group }, { requestId });
}

export async function handleMoveAccountToGroup(_request: Request, env: Env, requestId: string, groupId: number, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new GroupService(env).moveAccountToGroup(accountId, groupId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
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
