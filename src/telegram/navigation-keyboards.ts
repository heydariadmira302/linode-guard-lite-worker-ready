import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderBackToMainKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

export function renderCancelToMainKeyboard(label = "取消"): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: label, callback_data: "menu:main" }]] };
}

export function renderCheckinShortcutKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "❤️ 立即打卡", callback_data: "admin_presence:checkin" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}
