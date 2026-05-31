type TelegramButtonStyle = "primary" | "success" | "danger";

export type TelegramInlineKeyboardButton =
  | { text: string; callback_data: string; style?: TelegramButtonStyle; icon_custom_emoji_id?: string }
  | { text: string; url: string; style?: TelegramButtonStyle; icon_custom_emoji_id?: string }
  | { text: string; copy_text: { text: string }; style?: TelegramButtonStyle; icon_custom_emoji_id?: string };

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramReplyKeyboardButton {
  text: string;
}

export interface TelegramReplyKeyboardMarkup {
  keyboard: TelegramReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
}

export interface TelegramMessagePayload {
  chat_id: string;
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup | TelegramReplyKeyboardMarkup;
  message_effect_id?: string;
}

export interface TelegramEditMessagePayload {
  chat_id: string;
  message_id: number;
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface TelegramDeleteMessagePayload {
  chat_id: string;
  message_id: number;
}

export interface TelegramAnswerCallbackQueryPayload {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}

export type TelegramClientAction =
  | { method: "sendMessage"; payload: TelegramMessagePayload }
  | { method: "editMessageText"; payload: TelegramEditMessagePayload }
  | { method: "deleteMessage"; payload: TelegramDeleteMessagePayload }
  | { method: "answerCallbackQuery"; payload: TelegramAnswerCallbackQueryPayload };

export type TelegramClientResult = TelegramClientAction | TelegramClientAction[];

export type ParsedTelegramUpdate =
  | {
      kind: "message";
      chatId: string;
      fromId: string;
      fromUsername?: string | null;
      fromFirstName?: string | null;
      fromLastName?: string | null;
      fromName?: string | null;
      fromLanguageCode?: string | null;
      messageId: number;
      text: string;
      command?: string;
    }
  | {
      kind: "callback_query";
      callbackQueryId: string;
      chatId: string;
      fromId: string;
      fromUsername?: string | null;
      fromFirstName?: string | null;
      fromLastName?: string | null;
      fromName?: string | null;
      fromLanguageCode?: string | null;
      messageId: number;
      data: string;
    };
