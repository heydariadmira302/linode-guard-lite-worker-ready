export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramMessagePayload {
  chat_id: string;
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface TelegramEditMessagePayload extends TelegramMessagePayload {
  message_id: number;
}

export interface TelegramDeleteMessagePayload {
  chat_id: string;
  message_id: number;
}

export type TelegramClientAction =
  | { method: "sendMessage"; payload: TelegramMessagePayload }
  | { method: "editMessageText"; payload: TelegramEditMessagePayload }
  | { method: "deleteMessage"; payload: TelegramDeleteMessagePayload };

export type TelegramClientResult = TelegramClientAction | TelegramClientAction[];

export type ParsedTelegramUpdate =
  | {
      kind: "message";
      chatId: string;
      fromId: string;
      messageId: number;
      text: string;
      command?: string;
    }
  | {
      kind: "callback_query";
      callbackQueryId: string;
      chatId: string;
      fromId: string;
      messageId: number;
      data: string;
    };
