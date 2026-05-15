import type { ParsedTelegramUpdate } from "./types";

interface TelegramUpdateLike {
  message?: {
    message_id?: number;
    chat?: { id?: string | number };
    from?: { id?: string | number };
    text?: string;
  };
  callback_query?: {
    id?: string;
    from?: { id?: string | number };
    message?: { message_id?: number; chat?: { id?: string | number } };
    data?: string;
  };
}

export function parseTelegramUpdate(update: unknown): ParsedTelegramUpdate | null {
  const value = update as TelegramUpdateLike;
  if (value.message?.chat?.id !== undefined && value.message.from?.id !== undefined && value.message.message_id !== undefined) {
    const text = value.message.text ?? "";
    return {
      kind: "message",
      chatId: String(value.message.chat.id),
      fromId: String(value.message.from.id),
      messageId: value.message.message_id,
      text,
      command: parseCommand(text)
    };
  }

  const callback = value.callback_query;
  if (callback?.id && callback.from?.id !== undefined && callback.message?.chat?.id !== undefined && callback.message.message_id !== undefined) {
    return {
      kind: "callback_query",
      callbackQueryId: callback.id,
      chatId: String(callback.message.chat.id),
      fromId: String(callback.from.id),
      messageId: callback.message.message_id,
      data: callback.data ?? ""
    };
  }

  return null;
}

function parseCommand(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return undefined;
  const command = trimmed.slice(1).split(/\s+/)[0]?.split("@")[0];
  return command || undefined;
}
