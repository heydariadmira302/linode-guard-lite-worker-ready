import type { Env } from "../env";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";

export async function recordTelegramAutoDeleteMessage(env: Env, input: { chatId: string; messageId: number; direction: string; purpose?: string }): Promise<void> {
  if (!env.DB) return;
  try {
    await new TelegramMessagesRepository(env.DB).createIfMissing({
      chat_id: input.chatId,
      message_id: String(input.messageId),
      purpose: "auto_delete",
      metadata: { direction: input.direction, purpose: input.purpose ?? "telegram_message" }
    });
  } catch {
    // Message tracking is best-effort and must never block user-visible Telegram operations.
  }
}

export function readTelegramMessageId(value: unknown): number | null {
  const result = value as { result?: { message_id?: unknown } };
  return typeof result.result?.message_id === "number" ? result.result.message_id : null;
}
