import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountService } from "../services/account-service";
import { AccountsRepository } from "../storage/accounts-repository";
import { createJsonResponse } from "../utils/json-response";

export async function handleListAccounts(_request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const accounts = await new AccountService(env).listAccounts();
  return createJsonResponse({ ok: true, data: { accounts } }, { requestId });
}

export async function handleGetAccount(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const account = await new AccountService(env).getAccount(accountId, requestId);
  return createJsonResponse({ ok: true, data: { account } }, { requestId });
}

export async function handleCreateAccount(request: Request, env: Env, requestId: string): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as { alias?: unknown; token?: unknown };
  if (typeof body.alias !== "string" || typeof body.token !== "string") {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account request body", requestId, 400);
  }
  const normalizedAlias = body.alias.trim();
  if (await new AccountsRepository(env.DB as D1Database).getByAlias(normalizedAlias)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Account alias already exists", requestId, 400);
  }
  const account = await new AccountService(env).createAccount(
    { alias: body.alias, token: body.token },
    { requestId, actor: "api:default", source: "api" }
  );
  return createJsonResponse({ ok: true, data: { account } }, { requestId });
}

export async function handleUpdateAccountToken(request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const body = await readJsonBody(request, requestId) as { token?: unknown };
  if (typeof body.token !== "string") throw new AppError(ErrorCode.VALIDATION_ERROR, "Token is required", requestId, 400);
  const account = await new AccountService(env).updateAccountToken(accountId, body.token, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data: { account } }, { requestId });
}

export async function handleTestAccount(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const account = await new AccountService(env).testAccount(accountId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data: { account } }, { requestId });
}

export async function handleDeleteAccount(_request: Request, env: Env, requestId: string, accountId: number): Promise<Response> {
  ensureDb(env, requestId);
  const data = await new AccountService(env).deleteAccount(accountId, { requestId, actor: "api:default", source: "api" });
  return createJsonResponse({ ok: true, data }, { requestId });
}

function ensureDb(env: Env, requestId: string): void {
  if (!env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
}

async function readJsonBody(request: Request, requestId: string): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid JSON body", requestId, 400);
  }
}
