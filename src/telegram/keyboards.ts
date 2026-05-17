import type { TelegramInlineKeyboardMarkup, TelegramReplyKeyboardMarkup } from "./types";

export function renderMainReplyKeyboard(): TelegramReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🏠 主菜单" }, { text: "❤️ 打卡" }],
      [{ text: "🖥 服务器" }, { text: "👤 账号" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function renderCheckinInlineKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]]
  };
}
