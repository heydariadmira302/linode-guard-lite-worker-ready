import type { TelegramClientResult, TelegramEditMessagePayload, TelegramMessagePayload } from "../telegram/types";

export class TelegramClient {
  constructor(private readonly _botToken: string) {}

  sendMessage(payload: TelegramMessagePayload): TelegramClientResult {
    return { method: "sendMessage", payload };
  }

  editMessage(payload: TelegramEditMessagePayload): TelegramClientResult {
    return { method: "editMessageText", payload };
  }

  deleteMessage(chatId: string, messageId: number): TelegramClientResult {
    return { method: "deleteMessage", payload: { chat_id: chatId, message_id: messageId } };
  }
}
