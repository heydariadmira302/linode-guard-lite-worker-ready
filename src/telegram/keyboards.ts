import type { TelegramInlineKeyboardMarkup, TelegramReplyKeyboardMarkup } from "./types";
import { renderCheckinShortcutKeyboard } from "./navigation-keyboards";

export function renderMainReplyKeyboard(): TelegramReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🏠 主控菜单" }, { text: "🖥 云机管理" }],
      [{ text: "📅 定时计划" }, { text: "❤️ 打卡保活" }],
      [{ text: "📊 状态总览" }, { text: "🪪 我的ID" }],
      [{ text: "📋 更多功能" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function renderCheckinInlineKeyboard(): TelegramInlineKeyboardMarkup {
  return renderCheckinShortcutKeyboard();
}
