import type { AdminPresenceStatusResult, PublicAdminPresencePolicy } from "../services/admin-presence-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderAdminPresenceMenuText(data: AdminPresenceStatusResult): string {
  return [
    "管理员保活确认",
    "",
    "你定期告诉系统：我还在，这些机器继续保留；如果太久没确认，系统就按预设策略提醒、关机或删除。",
    "",
    `最近确认时间：${data.status.last_checkin_at ?? "从未确认"}`,
    `current_cycle_id：${data.status.current_cycle_id ?? "-"}`,
    `启用策略组数量：${data.enabled_policy_count}`
  ].join("\n");
}

export function renderAdminPresenceMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "手动确认", callback_data: "admin_presence:checkin" }], [{ text: "查看策略组", callback_data: "admin_presence:policies" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

export function renderAdminPresenceCheckinText(data: { status: { last_checkin_at: string | null; current_cycle_id: string | null } }): string {
  return ["保活确认已更新", "", `最近确认时间：${data.status.last_checkin_at ?? "-"}`, `current_cycle_id：${data.status.current_cycle_id ?? "-"}`].join("\n");
}

export function renderAdminPresencePoliciesText(policies: PublicAdminPresencePolicy[]): string {
  const lines = ["保活确认策略组", ""];
  if (policies.length === 0) lines.push("暂无策略组。");
  for (const policy of policies.slice(0, 10)) {
    lines.push(`#${policy.id} ${policy.name}`, `状态：${policy.enabled ? "启用" : "停用"}`, `scope：${policy.scope}`, `action：${policy.action}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function renderAdminPresencePoliciesKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "手动确认", callback_data: "admin_presence:checkin" }], [{ text: "返回保活确认", callback_data: "menu:admin_presence" }]] };
}
