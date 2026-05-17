import type { PublicAccount } from "../services/account-service";
import type { PowerScheduleRecord } from "../storage/schedules-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderSchedulesMenuText(): string {
  return ["⏰ 定时任务", "", "配置轻量定时开机 / 关机任务。", "当前支持单账号或全部账号，动作仅支持开机 / 关机。"].join("\n");
}

export function renderSchedulesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "新增任务", callback_data: "schedules:create" }],
      [{ text: "查看定时任务", callback_data: "schedules:list" }],
      [{ text: "暂停全部", callback_data: "schedules:disable_all_confirm" }, { text: "启用全部", callback_data: "schedules:enable_all" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCreateActionText(): string {
  return ["⏰ 新增定时任务", "", "请选择动作："].join("\n");
}

export function renderScheduleCreateActionKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "开机", callback_data: "schedules:create:action:boot" }],
      [{ text: "关机", callback_data: "schedules:create:action:shutdown" }],
      [{ text: "返回定时任务", callback_data: "menu:schedules" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCreateScopeText(action: string): string {
  return ["⏰ 新增定时任务", "", `动作：${formatScheduleAction(action)}`, "", "请选择范围："].join("\n");
}

export function renderScheduleCreateScopeKeyboard(action: "boot" | "shutdown"): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "全部账号", callback_data: `schedules:create:scope:${action}:all` }],
      [{ text: "选择账号", callback_data: `schedules:create:scope:${action}:account` }],
      [{ text: "选择分组", callback_data: `schedules:create:scope:${action}:group` }],
      [{ text: "返回选择动作", callback_data: "schedules:create" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCreateAccountText(action: string, accounts: PublicAccount[]): string {
  const lines = ["⏰ 新增定时任务", "", `动作：${formatScheduleAction(action)}`, "范围：单账号", "", "请选择账号："];
  if (accounts.length === 0) lines.push("暂无可用账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderScheduleCreateAccountKeyboard(action: "boot" | "shutdown", accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `schedules:create:account:${action}:${account.id}` }]),
      [{ text: "返回选择范围", callback_data: `schedules:create:action:${action}` }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCreateGroupText(action: string, groups: Array<{ id: number; name: string }>): string {
  const lines = ["⏰ 新增定时任务", "", `动作：${formatScheduleAction(action)}`, "范围：分组", "", "请选择分组："];
  if (groups.length === 0) lines.push("暂无可用分组。");
  return lines.join("\n");
}

export function renderScheduleCreateGroupKeyboard(action: "boot" | "shutdown", groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: group.name, callback_data: `schedules:create:group:${action}:${group.id}` }]),
      [{ text: "返回选择范围", callback_data: `schedules:create:action:${action}` }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCreatePresetText(action: string, scope: "all" | "account" | "group", accountId?: number, groupId?: number): string {
  return ["⏰ 新增定时任务", "", `动作：${formatScheduleAction(action)}`, `范围：${formatScheduleScope(scope, accountId, groupId)}`, "", "请选择执行时间："].join("\n");
}

export function renderScheduleCreatePresetKeyboard(action: "boot" | "shutdown", scope: "all" | "account" | "group", accountId?: number, groupId?: number): TelegramInlineKeyboardMarkup {
  const scopePart = scope === "account" ? `account:${accountId}` : scope === "group" ? `group:${groupId}` : "all";
  const backCallback = scope === "account" ? `schedules:create:scope:${action}:account` : scope === "group" ? `schedules:create:scope:${action}:group` : `schedules:create:action:${action}`;
  return {
    inline_keyboard: [
      [{ text: "每天 08:00", callback_data: `schedules:create:preset:${action}:${scopePart}:daily_0800` }],
      [{ text: "每天 22:00", callback_data: `schedules:create:preset:${action}:${scopePart}:daily_2200` }],
      [{ text: "自定义时间", callback_data: `schedules:create:custom:${action}:${scopePart}` }],
      [{ text: "返回选择范围", callback_data: backCallback }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleListText(schedules: PowerScheduleRecord[]): string {
  const lines = ["⏰ 定时任务列表", ""];
  if (schedules.length === 0) lines.push("暂无定时任务。");
  for (const s of schedules.slice(0, 10)) {
    lines.push(`#${s.id} ${s.name}`, `状态：${formatScheduleEnabled(s.enabled)}`, `动作：${formatScheduleAction(s.action)}`, `范围：${formatScheduleScope(s.scope, s.account_id)}`, `Cron：${s.cron_expr}`, `下次运行：${s.next_run_at ?? "-"}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function renderScheduleListKeyboard(schedules: PowerScheduleRecord[] = []): TelegramInlineKeyboardMarkup {
  const rows = schedules.slice(0, 10).flatMap((schedule) => {
    const toggle = Number(schedule.enabled) === 1
      ? { text: `#${schedule.id} 停用`, callback_data: `schedules:disable:${schedule.id}` }
      : { text: `#${schedule.id} 启用`, callback_data: `schedules:enable:${schedule.id}` };
    return [
      [toggle, { text: `#${schedule.id} 删除`, callback_data: `schedules:delete_confirm:${schedule.id}` }]
    ];
  });
  return { inline_keyboard: [...rows, [{ text: "返回定时任务", callback_data: "menu:schedules" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function renderScheduleDeleteConfirmText(schedule: PowerScheduleRecord): string {
  return ["⚠️ 确认删除定时任务？", "", `任务：#${schedule.id} ${schedule.name}`, `动作：${formatScheduleAction(schedule.action)}`, `范围：${formatScheduleScope(schedule.scope, schedule.account_id)}`, `Cron：${schedule.cron_expr}`, "", "删除后这个定时开机 / 关机任务将不再执行。"].join("\n");
}

export function renderScheduleDeleteConfirmKeyboard(schedule: PowerScheduleRecord): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "确认删除", callback_data: `schedules:delete:${schedule.id}` }],
      [{ text: "取消", callback_data: "schedules:list" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderScheduleCustomTimePrompt(action: string, scope: "all" | "account" | "group", accountId?: number, groupId?: number): string {
  return [
    "⏰ 自定义定时任务时间",
    "",
    `动作：${formatScheduleAction(action)}`,
    `范围：${formatScheduleScope(scope, accountId, groupId)}`,
    "",
    "请发送时间或 Cron：",
    "- 每天固定时间：例如 09:30 或 22:00",
    "- 自定义 Cron：例如 30 9 * * *",
    "",
    "发送 /cancel 可取消。"
  ].join("\n");
}

export function renderScheduleBulkToggleConfirmText(): string {
  return ["⚠️ 确认暂停全部定时任务？", "", "暂停后，所有已启用的定时开机 / 关机任务都不会再自动执行。", "你可以稍后在定时任务菜单里一键启用全部。"].join("\n");
}

export function renderScheduleBulkToggleConfirmKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "确认暂停全部", callback_data: "schedules:disable_all" }], [{ text: "取消", callback_data: "menu:schedules" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function renderScheduleBulkToggleResultText(action: "enabled_all" | "disabled_all", affected: number): string {
  const title = action === "enabled_all" ? "✅ 已启用全部定时任务" : "⏸ 已暂停全部定时任务";
  return [title, "", `本次影响任务数：${affected}`].join("\n");
}

export function renderScheduleActionResultText(action: "created" | "enabled" | "disabled" | "deleted", schedule: PowerScheduleRecord): string {
  const title = action === "created" ? "✅ 定时任务已创建" : action === "enabled" ? "✅ 定时任务已启用" : action === "disabled" ? "⏸ 定时任务已停用" : "🗑 定时任务已删除";
  return [title, "", `任务：#${schedule.id} ${schedule.name}`, `动作：${formatScheduleAction(schedule.action)}`, `范围：${formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id)}`, `Cron：${schedule.cron_expr}`, `下次运行：${schedule.next_run_at ?? "-"}`].join("\n");
}

export function renderScheduleActionResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回定时任务列表", callback_data: "schedules:list" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function formatScheduleAction(action: string): string {
  if (action === "boot") return "开机";
  if (action === "shutdown") return "关机";
  return action;
}

export function formatScheduleEnabled(enabled: number | boolean): string {
  return Number(enabled) === 1 ? "启用" : "停用";
}

export function formatScheduleScope(scope: string, accountId?: number | null, groupId?: number | null): string {
  if (scope === "all") return "全部账号";
  if (scope === "account") return `单账号${accountId ? ` #${accountId}` : ""}`;
  if (scope === "group") return `分组${groupId ? ` #${groupId}` : ""}`;
  return scope;
}
