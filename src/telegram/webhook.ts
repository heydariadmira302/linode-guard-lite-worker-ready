import type { Env } from "../env";
import { hasExplicitSuperAdmin } from "../env";
import { TelegramClient } from "../clients/telegram-client";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { verifyTelegramWebhookSecret, isSuperAdmin } from "../middleware/auth";
import { BotSessionsRepository } from "../storage/bot-sessions-repository";
import { SettingsRepository } from "../storage/settings-repository";
import { BotSessionService } from "../services/bot-session-service";
import { createJsonResponse } from "../utils/json-response";
import { parseTelegramUpdate } from "./update-parser";
import { handleTelegramMessageCommand } from "./commands";
import { routeTelegramCallback } from "./callbacks";

export async function handleTelegramWebhook(request: Request, env: Env, requestId: string): Promise<Response> {
  if (!(await verifyTelegramWebhookSecret(request, env))) {
    throw new AppError(ErrorCode.WEBHOOK_SECRET_INVALID, "Invalid Telegram webhook secret", requestId, 401);
  }

  const update = parseTelegramUpdate(await request.json());
  if (!update) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Telegram update", requestId, 400);
  }

  if (env.DB && !hasExplicitSuperAdmin(env)) {
    const repository = new SettingsRepository(env.DB);
    const superAdmin = await repository.get<{ telegram_user_id?: string }>("super_admin");
    if (!superAdmin?.telegram_user_id) {
      await repository.set("super_admin", { telegram_user_id: String(update.fromId), bootstrapped_at: new Date().toISOString(), source: "telegram:first_message" });
    } else if (String(superAdmin.telegram_user_id) !== String(update.fromId)) {
      throw new AppError(ErrorCode.FORBIDDEN, "Telegram user is not Super Admin", requestId, 403);
    }
  } else if (!isSuperAdmin(update.fromId, env)) {
    throw new AppError(ErrorCode.FORBIDDEN, "Telegram user is not Super Admin", requestId, 403);
  }

  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const sessionService = env.DB
    ? new BotSessionService(new BotSessionsRepository(env.DB))
    : { clearCurrentSession: async () => undefined, getCurrentSession: async () => null, setCurrentSession: async () => undefined };

  const telegram = update.kind === "message"
    ? await handleTelegramMessageCommand(update, client, sessionService, env, requestId)
    : await routeTelegramCallback(update, client, sessionService, env, requestId);

  return createJsonResponse({ ok: true, data: { telegram } }, { requestId });
}

