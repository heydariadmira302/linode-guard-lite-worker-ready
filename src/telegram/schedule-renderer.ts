import type { PublicAccount } from "../services/account-service";
import type { AccountInstancesResult } from "../services/instance-service";
import type { LinodeInstance } from "../clients/linode-client";
import type { PowerScheduleRecord } from "../storage/schedules-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";
import { encodeScheduleAction, encodeScheduleScope } from "./callback-codec";
import { renderTelegramOperationResult } from "./result-template";

const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const SCHEDULE_MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export function renderSchedulesMenuText(): string {
  return [
    "⏰ 定时任务",
    "━━━━━━━━━━━━",
    "自动开机 / 关机 / 重启的任务中心。",
    "",
    "支持范围：",
    "• 🌐 全部账号",
    "• 👤 单账号",
    "• 📁 分组",
    "• 🖥 单台服务器",
    "",
    "Cron 执行后会主动发送结果通知。"
  ].join("\n");
}

export function renderSchedulesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "➕ 新增定时任务", callback_data: "schedules:create" }],
      [{ text: "📋 查看定时任务", callback_data: "schedules:list" }],
      [{ text: "⏸ 暂停全部", callback_data: "schedules:disable_all_confirm" }, { text: "✅ 启用全部", callback_data: "schedules:enable_all" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderScheduleCreateActionText(): string {
  return [
    "⏰ 新增定时任务",
    "━━━━━━━━━━━━",
    "第 1/3 步：先选择要做什么。",
    "",
    "产品逻辑：先选动作，再选对象，最后选时间。",
    "开机会受 Boot safety 保护；关机和重启会写入审计日志。"
  ].join("\n");
}

export function renderScheduleCreateActionKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ 定时开机", callback_data: "sc:a:b" }],
      [{ text: "⚠️ 定时关机", callback_data: "sc:a:s" }],
      [{ text: "🔄 定时重启", callback_data: "sc:a:r" }],
      [{ text: "⬅️ 上一步：定时任务", callback_data: "menu:schedules" }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreateScopeText(action: string): string {
  return [
    "⏰ 新增定时任务",
    "━━━━━━━━━━━━",
    "第 2/3 步：选择作用对象。",
    "",
    `已选动作：${formatScheduleAction(action)}`,
    "",
    "如果要按分组执行，请点「📁 选择分组」。"
  ].join("\n");
}

export function renderScheduleCreateScopeKeyboard(action: "boot" | "shutdown" | "reboot"): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  return {
    inline_keyboard: [
      [{ text: "🌐 全部账号", callback_data: `sc:s:${actionCode}:a` }],
      [{ text: "👤 选择账号", callback_data: `sc:s:${actionCode}:u` }],
      [{ text: "📁 选择分组", callback_data: `sc:s:${actionCode}:g` }],
      [{ text: "🖥 选择单台服务器", callback_data: `sc:s:${actionCode}:i` }],
      [{ text: "⬅️ 上一步：选择动作", callback_data: "schedules:create" }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreateAccountText(action: string, accounts: PublicAccount[]): string {
  const lines = ["⏰ 新增定时任务", "━━━━━━━━━━━━", "第 2/3 步：选择账号", "", `已选动作：${formatScheduleAction(action)}`, "已选范围：👤 单账号", "", "请选择账号："];
  if (accounts.length === 0) lines.push("暂无可用账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderScheduleCreateAccountKeyboard(action: "boot" | "shutdown" | "reboot", accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `sc:u:${actionCode}:${account.id}` }]),
      [{ text: "⬅️ 上一步：选择范围", callback_data: `sc:a:${actionCode}` }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreateGroupText(action: string, groups: Array<{ id: number; name: string }>): string {
  const lines = ["⏰ 新增定时任务", "━━━━━━━━━━━━", "第 2/3 步：选择分组", "", `已选动作：${formatScheduleAction(action)}`, "已选范围：📁 分组", "", "请选择分组："];
  if (groups.length === 0) lines.push("暂无可用分组。");
  return lines.join("\n");
}

export function renderScheduleCreateGroupKeyboard(action: "boot" | "shutdown" | "reboot", groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: `📁 ${group.name}`, callback_data: `sc:g:${actionCode}:${group.id}` }]),
      [{ text: "⬅️ 上一步：选择范围", callback_data: `sc:a:${actionCode}` }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreateInstanceAccountText(action: string, accounts: PublicAccount[]): string {
  const lines = ["⏰ 新增定时任务", "━━━━━━━━━━━━", "第 2/3 步：先选择账号", "", `已选动作：${formatScheduleAction(action)}`, "已选范围：🖥 单台服务器", "", "请先选择服务器所属账号："];
  if (accounts.length === 0) lines.push("暂无可用账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderScheduleCreateInstanceAccountKeyboard(action: "boot" | "shutdown" | "reboot", accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `sc:ia:${actionCode}:${account.id}` }]),
      [{ text: "⬅️ 上一步：选择范围", callback_data: `sc:a:${actionCode}` }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreateInstanceText(action: string, account: PublicAccount, instances: LinodeInstance[]): string {
  const lines = ["⏰ 新增定时任务", "━━━━━━━━━━━━", "第 2/3 步：选择服务器", "", `已选动作：${formatScheduleAction(action)}`, "已选范围：🖥 单台服务器", `已选账号：#${account.id} ${account.alias}`, "", "请选择服务器："];
  if (instances.length === 0) lines.push("这个账号下暂无服务器。");
  return lines.join("\n");
}

export function renderScheduleCreateInstanceKeyboard(action: "boot" | "shutdown" | "reboot", data: AccountInstancesResult): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  return {
    inline_keyboard: [
      ...data.instances.slice(0, 10).map((instance) => [{ text: `#${instance.id} ${instance.label}`, callback_data: `sc:i:${actionCode}:${data.account.id}:${instance.id}` }]),
      [{ text: "⬅️ 上一步：选择账号", callback_data: `sc:s:${actionCode}:i` }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleCreatePresetText(action: string, scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): string {
  return [
    "⏰ 新增定时任务",
    "━━━━━━━━━━━━",
    "第 3/3 步：选择执行时间。",
    "",
    `已选动作：${formatScheduleAction(action)}`,
    `已选范围：${formatScheduleScope(scope, accountId, groupId, instanceId)}`,
    "",
    "可直接选常用时间；其他时间建议用按钮选择小时和分钟。"
  ].join("\n");
}

export function renderScheduleCreatePresetKeyboard(action: "boot" | "shutdown" | "reboot", scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  const scopePart = encodeScheduleScope(scope, accountId, groupId, instanceId);
  const backCallback = scope === "account" ? `sc:s:${actionCode}:u` : scope === "group" ? `sc:s:${actionCode}:g` : scope === "instance" ? `sc:s:${actionCode}:i` : `sc:a:${actionCode}`;
  const backLabel = scope === "account" ? "⬅️ 上一步：选择账号" : scope === "group" ? "⬅️ 上一步：选择分组" : scope === "instance" ? "⬅️ 上一步：选择服务器" : "⬅️ 上一步：选择范围";
  return {
    inline_keyboard: [
      [{ text: "🌅 每天 08:50", callback_data: `sc:p:${actionCode}:${scopePart}:0850` }],
      [{ text: "🌙 每天 23:05", callback_data: `sc:p:${actionCode}:${scopePart}:2305` }],
      [{ text: "🕘 选择其他时间", callback_data: `sc:th:${actionCode}:${scopePart}` }],
      [{ text: "⌨️ 手输 Cron（高级）", callback_data: `sc:c:${actionCode}:${scopePart}` }],
      [{ text: backLabel, callback_data: backCallback }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}


export function renderScheduleCreateHourText(action: string, scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): string {
  return [
    "⏰ 新增定时任务",
    "━━━━━━━━━━━━",
    "第 3/3 步：选择小时。",
    "",
    `已选动作：${formatScheduleAction(action)}`,
    `已选范围：${formatScheduleScope(scope, accountId, groupId, instanceId)}`,
    "",
    "请选择几点执行："
  ].join("\n");
}

export function renderScheduleCreateHourKeyboard(action: "boot" | "shutdown" | "reboot", scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  const scopePart = encodeScheduleScope(scope, accountId, groupId, instanceId);
  const rows = [] as Array<Array<{ text: string; callback_data: string }>>;
  for (let i = 0; i < SCHEDULE_HOURS.length; i += 4) {
    rows.push(SCHEDULE_HOURS.slice(i, i + 4).map((hour) => ({ text: hour, callback_data: `sc:tm:${actionCode}:${scopePart}:${hour}` })));
  }
  rows.push([{ text: "⬅️ 上一步：选择执行时间", callback_data: `sc:pback:${actionCode}:${scopePart}` }]);
  rows.push([{ text: "❌ 取消", callback_data: "menu:schedules" }]);
  return { inline_keyboard: rows };
}

export function renderScheduleCreateMinuteText(action: string, scope: "all" | "account" | "group" | "instance", hour: string, accountId?: number, groupId?: number, instanceId?: number): string {
  return [
    "⏰ 新增定时任务",
    "━━━━━━━━━━━━",
    "第 3/3 步：选择分钟。",
    "",
    `已选动作：${formatScheduleAction(action)}`,
    `已选范围：${formatScheduleScope(scope, accountId, groupId, instanceId)}`,
    `已选小时：${hour}:__`,
    "",
    "请选择分钟："
  ].join("\n");
}

export function renderScheduleCreateMinuteKeyboard(action: "boot" | "shutdown" | "reboot", scope: "all" | "account" | "group" | "instance", hour: string, accountId?: number, groupId?: number, instanceId?: number): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  const scopePart = encodeScheduleScope(scope, accountId, groupId, instanceId);
  const rows = [] as Array<Array<{ text: string; callback_data: string }>>;
  for (let i = 0; i < SCHEDULE_MINUTES.length; i += 4) {
    rows.push(SCHEDULE_MINUTES.slice(i, i + 4).map((minute) => ({ text: minute, callback_data: `sc:t:${actionCode}:${scopePart}:${hour}:${minute}` })));
  }
  rows.push([{ text: "⬅️ 上一步：重选小时", callback_data: `sc:th:${actionCode}:${scopePart}` }]);
  rows.push([{ text: "❌ 取消", callback_data: "menu:schedules" }]);
  return { inline_keyboard: rows };
}

export function renderScheduleListText(schedules: PowerScheduleRecord[]): string {
  const enabledCount = schedules.filter((s) => Number(s.enabled) === 1).length;
  const lines = ["⏰ 定时任务列表", "━━━━━━━━━━━━", `共 ${schedules.length} 个任务，启用 ${enabledCount} 个`, ""];
  if (schedules.length === 0) lines.push("暂无定时任务。可以先新增一个每天开机或关机任务。");
  for (const s of schedules.slice(0, 10)) {
    lines.push(`📌 #${s.id} ${s.name}`, `状态：${formatScheduleEnabled(s.enabled)}`, `动作：${formatScheduleAction(s.action)}`, `范围：${formatScheduleScope(s.scope, s.account_id, s.group_id, s.instance_id)}`, `Cron：${s.cron_expr}`, `下次运行：${s.next_run_at ?? "-"}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function renderScheduleListKeyboard(schedules: PowerScheduleRecord[] = []): TelegramInlineKeyboardMarkup {
  const rows = schedules.slice(0, 10).flatMap((schedule) => {
    const toggle = Number(schedule.enabled) === 1
      ? { text: `⏸ #${schedule.id} 停用`, callback_data: `schedules:disable:${schedule.id}` }
      : { text: `✅ #${schedule.id} 启用`, callback_data: `schedules:enable:${schedule.id}` };
    return [
      [{ text: `📋 #${schedule.id} 详情/修改`, callback_data: `schedules:detail:${schedule.id}` }],
      [toggle, { text: `🗑 #${schedule.id} 删除`, callback_data: `schedules:delete_confirm:${schedule.id}` }]
    ];
  });
  return { inline_keyboard: [...rows, [{ text: "↩️ 返回定时任务", callback_data: "menu:schedules" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}


export function renderScheduleDetailText(schedule: PowerScheduleRecord): string {
  return [
    "⏰ 定时任务详情",
    "━━━━━━━━━━━━",
    `任务：#${schedule.id} ${schedule.name}`,
    `状态：${formatScheduleEnabled(schedule.enabled)}`,
    `动作：${formatScheduleAction(schedule.action)}`,
    `范围：${formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id, schedule.instance_id)}`,
    `Cron：${schedule.cron_expr}`,
    `下次运行：${schedule.next_run_at ?? "-"}`,
    "",
    "可以直接修改动作、范围或执行时间，不需要删掉重建。"
  ].join("\n");
}

export function renderScheduleDetailKeyboard(schedule: PowerScheduleRecord): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [Number(schedule.enabled) === 1 ? { text: "⏸ 停用", callback_data: `schedules:disable:${schedule.id}` } : { text: "✅ 启用", callback_data: `schedules:enable:${schedule.id}` }],
      [{ text: "✏️ 修改任务", callback_data: `schedules:edit:${schedule.id}` }],
      [{ text: "🗑 删除任务", callback_data: `schedules:delete_confirm:${schedule.id}` }],
      [{ text: "↩️ 返回列表", callback_data: "schedules:list" }]
    ]
  };
}

export function renderScheduleEditText(schedule: PowerScheduleRecord): string {
  return [
    "✏️ 修改定时任务",
    "━━━━━━━━━━━━",
    `当前任务：#${schedule.id} ${schedule.name}`,
    `动作：${formatScheduleAction(schedule.action)}`,
    `范围：${formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id, schedule.instance_id)}`,
    `Cron：${schedule.cron_expr}`,
    "",
    "请选择要修改的内容："
  ].join("\n");
}

export function renderScheduleEditKeyboard(schedule: PowerScheduleRecord): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "修改动作", callback_data: `schedules:edit_action:${schedule.id}` }],
      [{ text: "修改作用范围", callback_data: `schedules:edit_scope:${schedule.id}` }],
      [{ text: "修改执行时间", callback_data: `schedules:edit_time:${schedule.id}` }],
      [{ text: "返回详情", callback_data: `schedules:detail:${schedule.id}` }]
    ]
  };
}

export function renderScheduleEditActionKeyboard(scheduleId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "✅ 改为开机", callback_data: `sc:ea:${scheduleId}:b` }],
    [{ text: "⚠️ 改为关机", callback_data: `sc:ea:${scheduleId}:s` }],
    [{ text: "🔄 改为重启", callback_data: `sc:ea:${scheduleId}:r` }],
    [{ text: "⬅️ 返回修改任务", callback_data: `schedules:edit:${scheduleId}` }]
  ] };
}

export function renderScheduleEditScopeKeyboard(scheduleId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "🌐 全部账号", callback_data: `sc:es:${scheduleId}:a` }],
    [{ text: "👤 选择账号", callback_data: `sc:es:${scheduleId}:u` }],
    [{ text: "📁 选择分组", callback_data: `sc:es:${scheduleId}:g` }],
    [{ text: "🖥 选择单台服务器", callback_data: `sc:es:${scheduleId}:i` }],
    [{ text: "⬅️ 返回修改任务", callback_data: `schedules:edit:${scheduleId}` }]
  ] };
}

export function renderScheduleEditTimeKeyboard(schedule: PowerScheduleRecord): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(schedule.action);
  const scopePart = encodeScheduleScope(schedule.scope as "all" | "account" | "group" | "instance", schedule.account_id ?? undefined, schedule.group_id ?? undefined, schedule.instance_id ?? undefined);
  return { inline_keyboard: [
    [{ text: "🌅 改为每天 08:50", callback_data: `sc:ep:${schedule.id}:0850` }],
    [{ text: "🌙 改为每天 23:05", callback_data: `sc:ep:${schedule.id}:2305` }],
    [{ text: "🕘 选择其他时间", callback_data: `sc:eh:${schedule.id}` }],
    [{ text: "⬅️ 返回修改任务", callback_data: `schedules:edit:${schedule.id}` }]
  ] };
}


export function renderScheduleEditHourKeyboard(scheduleId: number): TelegramInlineKeyboardMarkup {
  const rows = [] as Array<Array<{ text: string; callback_data: string }>>;
  for (let i = 0; i < SCHEDULE_HOURS.length; i += 4) rows.push(SCHEDULE_HOURS.slice(i, i + 4).map((hour) => ({ text: hour, callback_data: `sc:em:${scheduleId}:${hour}` })));
  rows.push([{ text: "⬅️ 上一步：选择执行时间", callback_data: `schedules:edit_time:${scheduleId}` }]);
  return { inline_keyboard: rows };
}

export function renderScheduleEditMinuteKeyboard(scheduleId: number, hour: string): TelegramInlineKeyboardMarkup {
  const rows = [] as Array<Array<{ text: string; callback_data: string }>>;
  for (let i = 0; i < SCHEDULE_MINUTES.length; i += 4) rows.push(SCHEDULE_MINUTES.slice(i, i + 4).map((minute) => ({ text: minute, callback_data: `sc:et:${scheduleId}:${hour}:${minute}` })));
  rows.push([{ text: "⬅️ 上一步：重选小时", callback_data: `sc:eh:${scheduleId}` }]);
  return { inline_keyboard: rows };
}

export function renderScheduleDeleteConfirmText(schedule: PowerScheduleRecord): string {
  return ["⚠️ 确认删除定时任务？", "", `任务：#${schedule.id} ${schedule.name}`, `动作：${formatScheduleAction(schedule.action)}`, `范围：${formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id, schedule.instance_id)}`, `Cron：${schedule.cron_expr}`, "", "删除后这个定时开机 / 关机 / 重启任务将不再执行。"].join("\n");
}

export function renderScheduleDeleteConfirmKeyboard(schedule: PowerScheduleRecord): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🗑 确认删除任务", callback_data: `schedules:delete:${schedule.id}` }],
      [{ text: "❌ 取消", callback_data: "schedules:list" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderScheduleCustomTimePrompt(action: string, scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): string {
  return [
    "⏰ 自定义定时任务时间",
    "",
    `动作：${formatScheduleAction(action)}`,
    `范围：${formatScheduleScope(scope, accountId, groupId, instanceId)}`,
    "",
    "请发送时间或 Cron：",
    "- 每天固定时间：例如 09:30 或 22:00",
    "- 自定义 Cron：例如 30 9 * * *",
    "",
    "发送 /cancel 可取消。"
  ].join("\n");
}



export function renderScheduleCustomTimePromptKeyboard(action: "boot" | "shutdown" | "reboot", scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): TelegramInlineKeyboardMarkup {
  const actionCode = encodeScheduleAction(action);
  const scopePart = encodeScheduleScope(scope, accountId, groupId, instanceId);
  return {
    inline_keyboard: [
      [{ text: "⬅️ 上一步：选择执行时间", callback_data: `sc:pback:${actionCode}:${scopePart}` }],
      [{ text: "❌ 取消", callback_data: "menu:schedules" }]
    ]
  };
}

export function renderScheduleBulkToggleConfirmText(): string {
  return ["⚠️ 确认暂停全部定时任务？", "", "暂停后，所有已启用的定时开机 / 关机任务都不会再自动执行。", "你可以稍后在定时任务菜单里一键启用全部。"].join("\n");
}

export function renderScheduleBulkToggleConfirmKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⏸ 确认暂停全部", callback_data: "schedules:disable_all" }], [{ text: "❌ 取消", callback_data: "menu:schedules" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function renderScheduleBulkToggleResultText(action: "enabled_all" | "disabled_all", affected: number): string {
  return renderTelegramOperationResult({
    title: action === "enabled_all" ? "已启用全部定时任务" : "已暂停全部定时任务",
    status: "success",
    fields: [{ label: "本次影响任务数", value: affected }],
    nextStep: "返回定时任务列表确认状态"
  });
}

export function renderScheduleActionResultText(action: "created" | "enabled" | "disabled" | "deleted" | "updated", schedule: PowerScheduleRecord): string {
  const title = action === "created" ? "定时任务已创建" : action === "updated" ? "定时任务已更新" : action === "enabled" ? "定时任务已启用" : action === "disabled" ? "定时任务已停用" : "定时任务已删除";
  return renderTelegramOperationResult({
    title,
    status: "success",
    fields: [
      { label: "任务", value: `#${schedule.id} ${schedule.name}` },
      { label: "动作", value: formatScheduleAction(schedule.action) },
      { label: "范围", value: formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id, schedule.instance_id) },
      { label: "Cron", value: schedule.cron_expr },
      { label: "下次运行", value: schedule.next_run_at ?? "-" }
    ],
    nextStep: "返回定时任务列表确认状态"
  });
}

export function renderScheduleActionResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "📋 返回定时任务列表", callback_data: "schedules:list" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function formatScheduleAction(action: string): string {
  if (action === "boot") return "✅ 开机";
  if (action === "shutdown") return "⚠️ 关机";
  if (action === "reboot") return "🔄 重启";
  return action;
}

export function formatScheduleEnabled(enabled: number | boolean): string {
  return Number(enabled) === 1 ? "✅ 启用" : "⏸ 停用";
}

export function formatScheduleScope(scope: string, accountId?: number | null, groupId?: number | null, instanceId?: number | null): string {
  if (scope === "all") return "🌐 全部账号";
  if (scope === "account") return `👤 单账号${accountId ? ` #${accountId}` : ""}`;
  if (scope === "group") return `📁 分组${groupId ? ` #${groupId}` : ""}`;
  if (scope === "instance") return `🖥 单台服务器${accountId ? ` 账号 #${accountId}` : ""}${instanceId ? ` / 实例 #${instanceId}` : ""}`;
  return scope;
}
