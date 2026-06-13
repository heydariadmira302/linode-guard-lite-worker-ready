import type { Env } from "../env";
import { sendTelegramAction } from "../telegram/action-sender";

export type SuperAdminNotificationResult = {
  attempted: boolean;
  ok: boolean;
  error?: string;
};

export async function notifyNewSuperAdmin(env: Env, telegramUserId: string): Promise<SuperAdminNotificationResult> {
  if (!env.TELEGRAM_BOT_TOKEN) return { attempted: false, ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  const text = [
    "👑 你已被添加为 Linode Guard Lite 管理员",
    "",
    "你现在可以使用这个 Bot 管理授权范围内的 Linode 账号、服务器、定时任务和保活策略。",
    "",
    "请发送 /start 打开菜单。",
    "",
    "安全提醒：管理员权限较高，请确认 Telegram 账号已开启两步验证。"
  ].join("\n");
  try {
    await sendTelegramAction(env.TELEGRAM_BOT_TOKEN, {
      method: "sendMessage",
      payload: {
        chat_id: telegramUserId,
        text,
        reply_markup: { inline_keyboard: [[{ text: "打开菜单", callback_data: "menu:main" }]] }
      }
    });
    return { attempted: true, ok: true };
  } catch (error) {
    return { attempted: true, ok: false, error: error instanceof Error ? error.message : "Telegram notification failed" };
  }
}
