import type { PowerScheduleRecord } from "../storage/schedules-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderSchedulesMenuText(): string {
  return ["定时开关机", "", "配置轻量定时开机 / 关机任务。", "当前支持单账号或全部账号，动作仅支持 boot / shutdown。"].join("\n");
}

export function renderSchedulesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "查看定时任务", callback_data: "schedules:list" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

export function renderScheduleListText(schedules: PowerScheduleRecord[]): string {
  const lines = ["定时任务列表", ""];
  if (schedules.length === 0) lines.push("暂无定时任务。");
  for (const s of schedules.slice(0, 10)) {
    lines.push(`#${s.id} ${s.name}`, `状态：${s.enabled ? "启用" : "停用"}`, `动作：${s.action}`, `范围：${s.scope}${s.account_id ? ` #${s.account_id}` : ""}`, `cron：${s.cron_expr}`, `next_run_at：${s.next_run_at ?? "-"}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function renderScheduleListKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回定时开关机", callback_data: "menu:schedules" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}
