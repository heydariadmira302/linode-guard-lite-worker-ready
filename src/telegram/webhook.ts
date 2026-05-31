import type { Env } from "../env";
import { TelegramClient } from "../clients/telegram-client";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { verifyTelegramWebhookSecret } from "../middleware/auth";
import { BotSessionsRepository } from "../storage/bot-sessions-repository";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";
import { BotSessionService } from "../services/bot-session-service";
import { bootstrapOrVerifySuperAdmin } from "../services/super-admin-service";
import { readTelegramMessageId, recordTelegramAutoDeleteMessage } from "../services/telegram-message-tracking-service";
import { createJsonResponse } from "../utils/json-response";
import { parseTelegramUpdate } from "./update-parser";
import { handleTelegramMessageCommand } from "./commands";
import { routeTelegramCallback } from "./callbacks";
import { sendTelegramAction, sendTelegramResult } from "./action-sender";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult } from "./types";

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

  await trackIncomingTelegramMessage(env, update);

  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const sessionService = env.DB
    ? new BotSessionService(new BotSessionsRepository(env.DB))
    : { clearCurrentSession: async () => undefined, getCurrentSession: async () => null, setCurrentSession: async () => undefined };

  const callbackAck = update.kind === "callback_query"
    ? await sendTelegramAction(env.TELEGRAM_BOT_TOKEN, client.answerCallbackQuery({ callback_query_id: update.callbackQueryId, text: "处理中，请稍候...", show_alert: false }) as TelegramClientAction)
    : null;
  const telegram = update.kind === "message"
    ? await handleTelegramMessageCommand(update, client, sessionService, env, requestId)
    : await routeTelegramCallback(update, client, sessionService, env, requestId);
  const sent = await sendTelegramResult(env.TELEGRAM_BOT_TOKEN, telegram);
  await trackOutgoingTelegramMessages(env, telegram, sent);

  return createJsonResponse({ ok: true, data: { telegram, sent: callbackAck ? [callbackAck, ...sent] : sent } }, { requestId });
}

async function trackIncomingTelegramMessage(env: Env, update: ParsedTelegramUpdate): Promise<void> {
  if (!env.DB) return;
  try {
    const repository = new TelegramMessagesRepository(env.DB);
    if (update.kind === "callback_query") {
      const reminder = await repository.getPendingByMessagePurpose({ chat_id: update.chatId, message_id: String(update.messageId), purpose: "admin_presence_reminder" });
      if (reminder) return;
    }
    await repository.createIfMissing({
      chat_id: update.chatId,
      message_id: String(update.messageId),
      purpose: "auto_delete",
      metadata: { direction: update.kind === "message" ? "incoming" : "callback_source" }
    });
  } catch {
    // Message cleanup must never block normal Telegram operations, especially before /setup initializes D1.
  }
}

async function trackOutgoingTelegramMessages(env: Env, result: TelegramClientResult, responses: unknown[]): Promise<void> {
  if (!env.DB) return;
  const actions = Array.isArray(result) ? result : [result];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (action.method !== "sendMessage" && action.method !== "editMessageText") continue;
    const messageId = readTelegramMessageId(responses[index]) ?? (action.method === "editMessageText" ? action.payload.message_id : null);
    if (messageId === null) continue;
    await recordTelegramAutoDeleteMessage(env, { chatId: String(action.payload.chat_id), messageId, direction: action.method === "sendMessage" ? "outgoing" : "edited" });
  }
}
