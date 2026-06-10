import type { TelegramInlineKeyboardMarkup, TelegramReplyKeyboardMarkup } from "./types";
import { renderCheckinShortcutKeyboard } from "./navigation-keyboards";

export function renderMainReplyKeyboard(): TelegramReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🖥 服务器" }, { text: "⏰ 定时" }],
      [{ text: "👤 账号" }, { text: "❤️ 打卡" }],
      [{ text: "🏠 主菜单" }, { text: "📋 更多" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function renderCheckinInlineKeyboard(): TelegramInlineKeyboardMarkup {
  return renderCheckinShortcutKeyboard();
}
