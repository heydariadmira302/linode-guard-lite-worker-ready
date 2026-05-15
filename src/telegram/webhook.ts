import type { Env } from "../env";
import { TelegramClient } from "../clients/telegram-client";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { verifyTelegramWebhookSecret } from "../middleware/auth";
import { BotSessionsRepository } from "../storage/bot-sessions-repository";
import { BotSessionService } from "../services/bot-session-service";
import { bootstrapOrVerifySuperAdmin } from "../services/super-admin-service";
import { createJsonResponse } from "../utils/json-response";
import { parseTelegramUpdate } from "./update-parser";
import { handleTelegramMessageCommand } from "./commands";
import { routeTelegramCallback } from "./callbacks";
import { sendTelegramResult } from "./action-sender";

export async function handleTelegramWebhook(request: Request, env: Env, requestId: string): Promise<Response> {
  if (!(await verifyTelegramWebhookSecret(request, env))) {
    throw new AppError(ErrorCode.WEBHOOK_SECRET_INVALID, "Invalid Telegram webhook secret", requestId, 401);
  }

  const update = parseTelegramUpdate(await request.json());
  if (!update) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Telegram update", requestId, 400);
  }

  if (!(await bootstrapOrVerifySuperAdmin(env, String(update.fromId), String(update.chatId)))) {
    throw new AppError(ErrorCode.FORBIDDEN, "Telegram user is not Super Admin", requestId, 403);
  }

  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const sessionService = env.DB
    ? new BotSessionService(new BotSessionsRepository(env.DB))
    : { clearCurrentSession: async () => undefined, getCurrentSession: async () => null, setCurrentSession: async () => undefined };

  const telegram = update.kind === "message"
    ? await handleTelegramMessageCommand(update, client, sessionService, env, requestId)
    : await routeTelegramCallback(update, client, sessionService, env, requestId);
  const sent = await sendTelegramResult(env.TELEGRAM_BOT_TOKEN, telegram);

  return createJsonResponse({ ok: true, data: { telegram, sent } }, { requestId });
}

