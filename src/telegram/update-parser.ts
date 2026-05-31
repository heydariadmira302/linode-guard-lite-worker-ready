import type { ParsedTelegramUpdate } from "./types";

interface TelegramUpdateLike {
  message?: {
    message_id?: number;
    chat?: { id?: string | number };
    from?: { id?: string | number; username?: string; first_name?: string; last_name?: string; language_code?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    from?: { id?: string | number; username?: string; first_name?: string; last_name?: string; language_code?: string };
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
      fromUsername: value.message.from.username ?? null,
      fromFirstName: value.message.from.first_name ?? null,
      fromLastName: value.message.from.last_name ?? null,
      fromName: [value.message.from.first_name, value.message.from.last_name].filter(Boolean).join(" ") || null,
      fromLanguageCode: value.message.from.language_code ?? null,
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
      fromUsername: callback.from.username ?? null,
      fromFirstName: callback.from.first_name ?? null,
      fromLastName: callback.from.last_name ?? null,
      fromName: [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ") || null,
      fromLanguageCode: callback.from.language_code ?? null,
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
