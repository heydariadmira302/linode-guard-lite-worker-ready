import type { PublicAccount } from "../services/account-service";
import type { AdminPresenceStatusResult, PublicAdminPresencePolicy } from "../services/admin-presence-service";
import type { TelegramInlineKeyboardMarkup } from "./types";
import { encodePolicyAction, encodePolicyScope } from "./callback-codec";

export function renderAdminPresenceMenuText(data: AdminPresenceStatusResult): string {
  return [
    "❤️ 保活打卡 / 策略设置",
    "━━━━━━━━━━━━",
    "这里是保活总控：点一次打卡，就等于告诉系统“我还在，机器继续保留”。",
    "",
    "策略可以配置：",
    "• 多久没打卡先提醒",
    "• 多久后执行最终动作",
    "• 最终动作前是否每小时提醒",
    "",
    `最近打卡：${data.status.last_checkin_at ?? "从未打卡"}`,
    `启用策略：${data.enabled_policy_count} 个`
  ].join("\n");
}

export function renderAdminPresenceMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "❤️ 立即打卡", callback_data: "admin_presence:checkin" }], [{ text: "🛡 保活策略设置", callback_data: "admin_presence:policies" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function renderAdminPresenceCheckinText(data: { status: { last_checkin_at: string | null; current_cycle_id: string | null }; deleted_reminders?: number }): string {
  return [
    "✅ 保活打卡成功",
    "✅ 已打卡，保活周期已刷新",
    "━━━━━━━━━━━━",
    "羊羊已收到，你还在管理这套 Linode 资源。",
    "",
    `最近打卡：${data.status.last_checkin_at ?? "-"}`,
    `🕒 本次打卡：${data.status.last_checkin_at ?? "-"}`,
    "🔄 保活周期：已刷新",
    `🧹 本轮提醒：已清理 ${data.deleted_reminders ?? 0} 条`,
    "",
    "稳了，机器继续保留。🐑"
  ].join("\n");
}

export function renderAdminPresenceCheckinKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "❤️ 查看保活状态", callback_data: "menu:admin_presence" }], [{ text: "🛡 保活策略设置", callback_data: "admin_presence:policies" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function renderAdminPresencePoliciesText(policies: PublicAdminPresencePolicy[]): string {
  const enabledCount = policies.filter((policy) => Number(policy.enabled) === 1).length;
  const criticalCount = policies.filter((policy) => policy.action === "delete_all_instances").length;
  const lines = ["🛡 保活策略设置", "━━━━━━━━━━━━", `共 ${policies.length} 条策略，启用 ${enabledCount} 条，高危删机 ${criticalCount} 条`, "", "规则逻辑：先通知提醒；如果继续未打卡，到最终动作时间再执行动作。", ""];
  if (policies.length === 0) lines.push("暂无策略组。建议先创建一条只通知策略熟悉流程。");
  for (const policy of policies.slice(0, 10)) {
    lines.push(
      `📌 #${policy.id} ${policy.name}`,
      `状态：${formatPolicyEnabled(policy.enabled)}`,
      `范围：${formatPolicyScope(policy.scope)}`,
      `提醒时间：${formatPolicyMinutes(policy.remind_after_minutes)}`,
      `最终动作时间：${formatPolicyMinutes(policy.final_after_minutes)}`,
      `最终动作：${formatPolicyAction(policy.action)}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderAdminPresencePoliciesKeyboard(policies: PublicAdminPresencePolicy[] = []): TelegramInlineKeyboardMarkup {
  const rows = policies.slice(0, 10).flatMap((policy) => [
    [{ text: `📋 #${policy.id} 详情/修改`, callback_data: `admin_presence:policy:detail:${policy.id}` }],
    [Number(policy.enabled) === 1
      ? { text: `⏸ #${policy.id} 停用`, callback_data: `admin_presence:policy:disable:${policy.id}` }
      : { text: `✅ #${policy.id} 启用`, callback_data: `admin_presence:policy:enable:${policy.id}` }],
    [{ text: `🗑 #${policy.id} 删除`, callback_data: `admin_presence:policy:delete_confirm:${policy.id}` }]
  ]);
  return { inline_keyboard: [[{ text: "➕ 新建策略", callback_data: "admin_presence:policy:create" }], ...rows, [{ text: "↩️ 返回保活打卡", callback_data: "menu:admin_presence" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function renderAdminPresencePolicyActionText(action: "enabled" | "disabled", policy: PublicAdminPresencePolicy): string {
  const title = action === "enabled" ? "✅ 保活策略已启用" : "⏸ 保活策略已停用";
  return [title, "", renderAdminPresencePolicyDetailLines(policy).join("\n")].join("\n");
}

export function renderAdminPresencePolicyActionKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看/修改", callback_data: `admin_presence:policy:detail:${policy.id}` }],
      [{ text: "返回策略组", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function formatPolicyEnabled(enabled: number | boolean): string {
  return Number(enabled) === 1 ? "✅ 启用" : "⏸ 停用";
}

export function formatPolicyScope(scope: string): string {
  if (scope === "all") return "🌐 全部账号";
  if (scope.startsWith("account:")) return `👤 单账号 #${scope.split(":")[1]}`;
  if (scope.startsWith("group:")) return `📁 分组 #${scope.split(":")[1]}`;
  return scope;
}

export function formatPolicyAction(action: string): string {
  if (action === "notify") return "🔔 只通知";
  if (action === "shutdown_all_instances") return "⚠️ 关闭全部服务器";
  if (action === "delete_all_instances") return "🚨 删除全部服务器";
  return action;
}

export function formatPolicyMinutes(minutes: number | null | undefined): string {
  if (!Number.isFinite(minutes)) return "-";
  const value = Number(minutes);
  if (value % (24 * 60) === 0) return `${value / (24 * 60)} 天后`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours > 0 && mins > 0) return `${hours} 小时${mins} 分钟后`;
  if (hours > 0) return `${hours} 小时后`;
  return `${mins} 分钟后`;
}

export function renderAdminPresencePolicyCreateText(): string {
  return [
    "➕ 新增保活策略",
    "━━━━━━━━━━━━",
    "这条策略会守着你的 Linode 资源：如果太久没打卡，先提醒；再继续失联，才执行最终动作。",
    "保活策略是两段式：先提醒，再按配置执行最终动作。",
    "",
    "⏱ 创建流程",
    "1. 选择多久没打卡先提醒",
    "2. 选择最终动作：只通知 / 关机 / 删除",
    "3. 选择最终动作时间",
    "4. 可选：最终动作前每小时提醒",
    "5. 输入策略名称",
    "",
    "先从第一段通知时间开始："
  ].join("\n");
}

export function renderAdminPresencePolicyCreateKeyboard(): TelegramInlineKeyboardMarkup {
  return renderAdminPresencePolicyTimeKeyboard("pending", "all");
}

export function renderAdminPresencePolicyFinalActionText(remindAfter: number): string {
  return [
    "➕ 新增保活策略",
    "━━━━━━━━━━━━",
    `✅ 第一段通知：${formatPolicyMinutes(remindAfter)}`,
    "",
    "请选择第二段最终动作：",
    "• 只通知：到期后仍然只提醒，不碰服务器",
    "• 关闭全部服务器：到期后自动关机，数据仍保留",
    "• 删除全部服务器：高危，到期后自动删机，通常不可恢复"
  ].join("\n");
}

export function renderAdminPresencePolicyFinalActionKeyboard(remindAfter: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "只通知", callback_data: `ap:ca:${remindAfter}:n` }],
      [{ text: "关闭全部服务器", callback_data: `ap:ca:${remindAfter}:s` }],
      [{ text: "删除全部服务器", callback_data: `ap:ca:${remindAfter}:d` }],
      [{ text: "返回通知时间", callback_data: "admin_presence:policy:create" }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyScopeText(action: string, remindAfter?: number): string {
  return ["新增保活策略", "", remindAfter ? `第一段通知：${formatPolicyMinutes(remindAfter)}` : null, `第二段最终动作：${formatPolicyAction(action)}`, "", "请选择作用范围："].filter(Boolean).join("\n");
}

export function renderAdminPresencePolicyScopeKeyboard(action: string, remindAfter?: number): TelegramInlineKeyboardMarkup {
  const actionCode = encodePolicyAction(action);
  const prefix = remindAfter ? `ap:cs:${remindAfter}:${actionCode}` : `ap:cs0:${actionCode}`;
  return {
    inline_keyboard: [
      [{ text: "全部账号", callback_data: `${prefix}:a` }],
      [{ text: "选择账号", callback_data: `${prefix}:u` }],
      [{ text: "选择分组", callback_data: `${prefix}:g` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyAccountText(action: string, accounts: PublicAccount[]): string {
  const lines = ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, "范围：单账号", "", "请选择账号："];
  if (accounts.length === 0) lines.push("暂无可用账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderAdminPresencePolicyAccountKeyboard(action: string, accounts: PublicAccount[], remindAfter?: number): TelegramInlineKeyboardMarkup {
  const prefix = remindAfter ? `ap:cua:${remindAfter}:${encodePolicyAction(action)}` : `ap:cu:${encodePolicyAction(action)}`;
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `${prefix}:${account.id}` }]),
      ...(accounts.length === 0 ? [[{ text: "去添加账号", callback_data: "accounts:add" }]] : []),
      [{ text: "返回选择范围", callback_data: remindAfter ? `ap:ca:${remindAfter}:${encodePolicyAction(action)}` : `admin_presence:policy:create_action:${action}` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyGroupText(action: string, groups: Array<{ id: number; name: string }>): string {
  const lines = ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, "范围：分组", "", "请选择分组："];
  if (groups.length === 0) lines.push("暂无可用分组。");
  return lines.join("\n");
}

export function renderAdminPresencePolicyGroupKeyboard(action: string, groups: Array<{ id: number; name: string }>, remindAfter?: number): TelegramInlineKeyboardMarkup {
  const prefix = remindAfter ? `ap:cga:${remindAfter}:${encodePolicyAction(action)}` : `ap:cg:${encodePolicyAction(action)}`;
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: group.name, callback_data: `${prefix}:${group.id}` }]),
      ...(groups.length === 0 ? [[{ text: "去新建分组", callback_data: "groups:create" }]] : []),
      [{ text: "返回选择范围", callback_data: remindAfter ? `ap:ca:${remindAfter}:${encodePolicyAction(action)}` : `admin_presence:policy:create_action:${action}` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyTimeText(action: string, scope = "all"): string {
  const actionLine = action === "pending" ? null : `第二段最终动作：${formatPolicyAction(action)}`;
  return ["新增保活策略", "", actionLine, scope !== "all" || action !== "pending" ? `范围：${formatPolicyScope(scope)}` : null, "", "请选择第一段通知时间：超过多久未打卡时先提醒你，不执行服务器操作。"].filter(Boolean).join("\n");
}

export function renderAdminPresencePolicyTimeKeyboard(action: string, scope = "all"): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "30 分钟", minutes: 30 },
    { text: "1 小时", minutes: 60 },
    { text: "2 小时", minutes: 120 },
    { text: "6 小时", minutes: 360 },
    { text: "12 小时", minutes: 720 },
    { text: "18 小时", minutes: 1080 },
    { text: "23 小时", minutes: 1380 },
    { text: "24 小时", minutes: 1440 }
  ];
  return {
    inline_keyboard: [
      ...chunkTimeOptions(options).map((row) => row.map((option) => ({ text: `${option.text}后提醒`, callback_data: `ap:cr:${encodePolicyAction(action)}:${encodePolicyScope(scope)}:${option.minutes}` }))),
      [{ text: "自定义提醒时间", callback_data: `ap:cth:r:${encodePolicyAction(action)}:${encodePolicyScope(scope)}` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyFinalTimeText(action: string, remindAfter: number, scope = "all"): string {
  return [
    "➕ 新增保活策略",
    "━━━━━━━━━━━━",
    `✅ 第一段通知：${formatPolicyMinutes(remindAfter)}`,
    `🎯 作用范围：${formatPolicyScope(scope)}`,
    `🛡 最终动作：${formatPolicyAction(action)}`,
    "",
    "请选择第二段最终动作时间：",
    "只有超过这个时间仍未打卡，才会执行最终动作。"
  ].join("\n");
}

export function renderAdminPresencePolicyFinalTimeKeyboard(action: string, remindAfter: number, scope = "all"): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "1 小时后", minutes: 60 },
    { text: "2 小时后", minutes: 120 },
    { text: "6 小时后", minutes: 360 },
    { text: "12 小时后", minutes: 720 },
    { text: "18 小时后", minutes: 1080 },
    { text: "23 小时后", minutes: 1380 },
    { text: "24 小时后", minutes: 1440 }
  ].filter((option) => option.minutes > remindAfter);
  return {
    inline_keyboard: [
      ...chunkTimeOptions(options).map((row) => row.map((option) => ({ text: option.text, callback_data: `ap:cf:${encodePolicyAction(action)}:${encodePolicyScope(scope)}:${remindAfter}:${option.minutes}` }))),
      ...(remindAfter < 1440 ? [[{ text: "自定义最终动作时间", callback_data: `ap:cth:f:${encodePolicyAction(action)}:${encodePolicyScope(scope)}:${remindAfter}` }]] : []),
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyHourlyReminderText(action: string, remindAfter: number, finalAfter: number, scope = "all"): string {
  return [
    "➕ 新增保活策略",
    "━━━━━━━━━━━━",
    `✅ 第一段通知：${formatPolicyMinutes(remindAfter)}`,
    `🎯 作用范围：${formatPolicyScope(scope)}`,
    `🛡 最终动作：${formatPolicyAction(action)}`,
    `⏰ 最终动作时间：${formatPolicyMinutes(finalAfter)}`,
    "",
    "是否在最终动作前开启每小时打卡提醒？",
    "要不要加一层“临门一脚”提醒？",
    "开启后，会在最终动作前指定时间开始，每小时提醒一次，直到你打卡或最终动作执行。",
    "",
    "不想打扰太多，就选“不重复提醒”。"
  ].join("\n");
}

export function renderAdminPresencePolicyHourlyReminderKeyboard(action: string, scope: string, remindAfter: number, finalAfter: number): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "不重复提醒", minutes: 0 },
    { text: "最终前 3 小时", minutes: 180 },
    { text: "最终前 6 小时", minutes: 360 },
    { text: "最终前 12 小时", minutes: 720 },
    { text: "最终前 24 小时", minutes: 1440 }
  ].filter((option) => option.minutes === 0 || finalAfter - option.minutes > remindAfter);
  return {
    inline_keyboard: [
      ...chunkTimeOptions(options).map((row) => row.map((option) => ({ text: option.text, callback_data: `ap:ch:${encodePolicyAction(action)}:${encodePolicyScope(scope)}:${remindAfter}:${finalAfter}:${option.minutes}` }))),
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyNamePrompt(action: string, remindAfter?: number | null, finalAfter?: number | null, scope = "all", hourlyBefore?: number | null): string {
  return ["➕ 新增保活策略", "━━━━━━━━━━━━", remindAfter ? `✅ 第一段通知：${formatPolicyMinutes(remindAfter)}` : null, action === "notify" ? "🛡 最终动作：只通知" : `🛡 最终动作：${formatPolicyAction(action)}`, `🎯 作用范围：${formatPolicyScope(scope)}`, finalAfter && action !== "notify" ? `⏰ 最终动作时间：${formatPolicyMinutes(finalAfter)}` : null, hourlyBefore && hourlyBefore > 0 ? `🔔 最终动作前每小时提醒：提前 ${formatPolicyMinutes(hourlyBefore).replace("后", "")}` : "🔕 每小时提醒：不重复提醒", "", "请输入策略名称。", "最后，给这条策略起个名字：", "例如：12小时未打卡提醒、24小时未打卡关机。", "", "不想继续可以点下方取消，或发送 /cancel。"].filter(Boolean).join("\n");
}

export function renderAdminPresencePolicyNamePromptKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "取消创建", callback_data: "admin_presence:policies" }]] };
}

export function renderAdminPresenceDeletePolicyWarning(): string {
  return [
    "⚠️ 高危保活策略提醒",
    "",
    "你选择的是：删除全部服务器。",
    "",
    "保活策略规则大于一切：策略生效后，到达触发条件会直接执行，不再二次确认。",
    "这个动作通常无法恢复，请确认时间设置正确。"
  ].join("\n");
}

export function renderAdminPresencePolicyDetailText(policy: PublicAdminPresencePolicy): string {
  return ["🛡 保活策略详情", "━━━━━━━━━━━━", ...renderAdminPresencePolicyDetailLines(policy)].join("\n");
}

export function renderAdminPresencePolicyDetailKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [Number(policy.enabled) === 1 ? { text: "⏸ 停用", callback_data: `admin_presence:policy:disable:${policy.id}` } : { text: "✅ 启用", callback_data: `admin_presence:policy:enable:${policy.id}` }],
      [{ text: "✏️ 修改策略", callback_data: `admin_presence:policy:edit:${policy.id}` }],
      [{ text: "🗑 删除", callback_data: `admin_presence:policy:delete_confirm:${policy.id}` }],
      [{ text: "↩️ 返回策略组", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyEditText(policy: PublicAdminPresencePolicy): string {
  return ["✏️ 修改保活策略", "━━━━━━━━━━━━", ...renderAdminPresencePolicyDetailLines(policy), "", "可以修改名称、最终动作、范围、提醒时间和最终动作时间。", "", "请选择要修改的内容："].join("\n");
}

export function renderAdminPresencePolicyEditKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "修改名称", callback_data: `admin_presence:policy:edit_name:${policy.id}` }],
      [{ text: "修改最终动作", callback_data: `admin_presence:policy:edit_action:${policy.id}` }],
      [{ text: "修改作用范围", callback_data: `admin_presence:policy:edit_scope:${policy.id}` }],
      [{ text: "修改提醒时间", callback_data: `admin_presence:policy:edit_remind:${policy.id}` }],
      policy.action === "notify" ? [] : [{ text: "修改最终动作时间", callback_data: `admin_presence:policy:edit_final:${policy.id}` }],
      [{ text: "返回详情", callback_data: `admin_presence:policy:detail:${policy.id}` }]
    ].filter((row) => row.length > 0)
  };
}

export function renderAdminPresencePolicyEditActionKeyboard(policyId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "只通知", callback_data: `ap:ea:${policyId}:n` }],
      [{ text: "关闭全部服务器", callback_data: `ap:ea:${policyId}:s` }],
      [{ text: "删除全部服务器", callback_data: `ap:ea:${policyId}:d` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditScopeKeyboard(policyId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "全部账号", callback_data: `ap:es:${policyId}:a` }],
      [{ text: "选择账号", callback_data: `ap:es:${policyId}:u` }],
      [{ text: "选择分组", callback_data: `ap:es:${policyId}:g` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditAccountKeyboard(policyId: number, accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `ap:eu:${policyId}:${account.id}` }]),
      ...(accounts.length === 0 ? [[{ text: "去添加账号", callback_data: "accounts:add" }]] : []),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:edit_scope:${policyId}` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditGroupKeyboard(policyId: number, groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: group.name, callback_data: `ap:eg:${policyId}:${group.id}` }]),
      ...(groups.length === 0 ? [[{ text: "去新建分组", callback_data: "groups:create" }]] : []),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:edit_scope:${policyId}` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditTimeKeyboard(policyId: number, field: "remind" | "final", minMinutes = 0): TelegramInlineKeyboardMarkup {
  const options = (field === "remind"
    ? [
      { text: "30 分钟后", minutes: 30 },
      { text: "1 小时后", minutes: 60 },
      { text: "2 小时后", minutes: 120 },
      { text: "6 小时后", minutes: 360 },
      { text: "12 小时后", minutes: 720 },
      { text: "18 小时后", minutes: 1080 },
      { text: "23 小时后", minutes: 1380 },
      { text: "24 小时后", minutes: 1440 }
    ]
    : [
      { text: "1 小时后", minutes: 60 },
      { text: "2 小时后", minutes: 120 },
      { text: "6 小时后", minutes: 360 },
      { text: "12 小时后", minutes: 720 },
      { text: "18 小时后", minutes: 1080 },
      { text: "23 小时后", minutes: 1380 },
      { text: "24 小时后", minutes: 1440 }
    ]).filter((option) => option.minutes > minMinutes);
  return {
    inline_keyboard: [
      ...chunkTimeOptions(options).map((row) => row.map((option) => ({ text: option.text, callback_data: `ap:et:${policyId}:${field === "remind" ? "r" : "f"}:${option.minutes}` }))),
      ...(field === "remind" || minMinutes < 1440 ? [[{ text: field === "remind" ? "自定义提醒时间" : "自定义最终动作时间", callback_data: `ap:eth:${field === "remind" ? "r" : "f"}:${policyId}` }]] : []),
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyTimeHourText(field: "remind" | "final", minMinutes = 0): string {
  return [
    field === "remind" ? "自定义第一段提醒时间" : "自定义第二段最终动作时间",
    "",
    "请选择小时。范围：0-24 小时。",
    field === "final" && minMinutes > 0 ? `必须晚于第一段：${formatPolicyMinutes(minMinutes)}` : null
  ].filter(Boolean).join("\n");
}

export function renderAdminPresencePolicyTimeHourKeyboard(prefix: string, minMinutes = 0): TelegramInlineKeyboardMarkup {
  const rows = [] as Array<Array<{ text: string; callback_data: string }>>;
  for (let hour = 0; hour <= 24; hour += 4) {
    rows.push([0, 1, 2, 3].map((offset) => hour + offset).filter((value) => value <= 24).map((value) => ({ text: `${value} 小时`, callback_data: `${prefix}:${value}` })));
  }
  rows.push([{ text: "取消", callback_data: "admin_presence:policies" }]);
  return { inline_keyboard: rows };
}

export function renderAdminPresencePolicyTimeMinuteText(field: "remind" | "final", hour: number, minMinutes = 0): string {
  return [
    field === "remind" ? "自定义第一段提醒时间" : "自定义第二段最终动作时间",
    "",
    `已选：${hour} 小时`,
    hour === 24 ? "已选 24 小时，分钟固定为 00。" : "请选择分钟。分钟按 5 分钟一档：00、05、10 ... 55。",
    field === "final" && minMinutes > 0 ? `最终动作时间必须晚于：${formatPolicyMinutes(minMinutes)}` : null
  ].filter(Boolean).join("\n");
}

export function renderAdminPresencePolicyTimeMinuteKeyboard(prefix: string, hour: number, minMinutes = 0): TelegramInlineKeyboardMarkup {
  const options = (hour === 24 ? [0] : Array.from({ length: 12 }, (_, index) => index * 5))
    .map((minute) => ({ minute, total: hour * 60 + minute }))
    .filter((option) => option.total > 0 && option.total <= 1440 && option.total > minMinutes);
  return {
    inline_keyboard: [
      ...chunkMinuteOptions(options).map((row) => row.map((option) => ({ text: option.minute.toString().padStart(2, "0"), callback_data: `${prefix}:${hour}:${option.minute}` }))),
      [{ text: "返回选小时", callback_data: buildTimeHourBackCallback(prefix) }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyUpdatedText(policy: PublicAdminPresencePolicy): string {
  return ["✅ 保活策略已更新", "", ...renderAdminPresencePolicyDetailLines(policy)].join("\n");
}

export function renderAdminPresencePolicyCreatedText(policy: PublicAdminPresencePolicy): string {
  return ["✅ 保活策略已创建", "", ...renderAdminPresencePolicyDetailLines(policy)].join("\n");
}

export function renderAdminPresencePolicyDeleteConfirmText(policy: PublicAdminPresencePolicy): string {
  return ["⚠️ 确认删除保活策略？", "", `策略：#${policy.id} ${policy.name}`, `最终动作：${formatPolicyAction(policy.action)}`, "", "删除策略只会停止这条保活规则，不会删除账号或服务器。"].join("\n");
}

export function renderAdminPresencePolicyDeleteConfirmKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "🗑 确认删除策略", callback_data: `admin_presence:policy:delete:${policy.id}` }], [{ text: "❌ 取消", callback_data: `admin_presence:policy:detail:${policy.id}` }], [{ text: "↩️ 返回策略组", callback_data: "admin_presence:policies" }]] };
}

export function renderAdminPresencePolicyDeletedText(policy: PublicAdminPresencePolicy): string {
  return ["✅ 保活策略已删除", "", `策略：#${policy.id} ${policy.name}`].join("\n");
}

export function renderAdminPresencePolicyDeletedKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回策略组", callback_data: "admin_presence:policies" }], [{ text: "返回保活打卡", callback_data: "menu:admin_presence" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

type TimeOption = { text: string; minutes: number };

function chunkTimeOptions<T extends TimeOption>(options: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < options.length; i += 2) rows.push(options.slice(i, i + 2));
  return rows;
}

function chunkMinuteOptions<T>(options: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < options.length; i += 4) rows.push(options.slice(i, i + 4));
  return rows;
}

function buildTimeHourBackCallback(prefix: string): string {
  const parts = prefix.split(":");
  if (parts[0] === "ap" && parts[1] === "ct" && parts.length >= 5) {
    return ["ap", "cth", parts[2], parts[3], parts[4], ...parts.slice(5)].join(":");
  }
  if (parts[0] === "ap" && parts[1] === "etc" && parts.length === 4) {
    return ["ap", "eth", parts[2], parts[3]].join(":");
  }
  return "admin_presence:policies";
}

function renderAdminPresencePolicyDetailLines(policy: PublicAdminPresencePolicy): string[] {
  return [
    `📌 策略：#${policy.id} ${policy.name}`,
    `状态：${formatPolicyEnabled(policy.enabled)}`,
    `范围：${formatPolicyScope(policy.scope)}`,
    `提醒时间：${formatPolicyMinutes(policy.remind_after_minutes)}`,
    policy.action === "notify" ? "最终动作：无" : `最终动作时间：${formatPolicyMinutes(policy.final_after_minutes)}`,
    policy.action === "notify" || !policy.hourly_reminder_before_minutes ? null : `最终动作前每小时提醒：提前 ${formatPolicyMinutes(policy.hourly_reminder_before_minutes).replace("后", "")}`,
    `最终动作：${formatPolicyAction(policy.action)}`,
    "",
    "⏱ 触发流程",
    `1. ${formatPolicyMinutes(policy.remind_after_minutes)}未打卡 → 通知提醒`,
    policy.action === "notify" ? "2. 最终动作 → 只通知，不执行服务器操作" : `2. ${formatPolicyMinutes(policy.final_after_minutes)}未打卡 → ${formatPolicyAction(policy.action)}`,
    policy.action === "notify" || !policy.hourly_reminder_before_minutes ? null : `3. 最终动作前 ${formatPolicyMinutes(policy.hourly_reminder_before_minutes).replace("后", "")}开始 → 每小时提醒打卡`,
    "",
    `创建时间：${policy.created_at}`,
    `更新时间：${policy.updated_at}`
  ].filter((line): line is string => Boolean(line));
}

export type AdminPresencePanelData = AdminPresenceStatusResult & { primary_policy: PublicAdminPresencePolicy | null };

export function renderAdminPresencePanelText(data: AdminPresencePanelData): string {
  const policy = data.primary_policy;
  return [
    "❤️ 保活风控",
    "━━━━━━━━━━━━",
    "点一次打卡，就等于告诉系统：我还在，机器继续保留。",
    "",
    `最近打卡：${data.status.last_checkin_at ?? "从未打卡"}`,
    `状态：${policy && Number(policy.enabled) === 1 ? "✅ 开启" : "⏸ 未开启"}`,
    "",
    policy ? [
      `提醒阈值：${policy.remind_after_minutes && policy.remind_after_minutes > 0 ? formatPolicyMinutes(policy.remind_after_minutes).replace("后", "未打卡后提醒") : "不提醒"}`,
      `最终动作阈值：${policy.final_after_minutes && policy.final_after_minutes > 0 ? formatPolicyMinutes(policy.final_after_minutes).replace("后", "未打卡后执行") : "不执行"}`,
      `最终动作：${formatPolicyAction(policy.action)}`,
      `作用范围：${formatPolicyScope(policy.scope)}`
    ].join("\n") : "当前还没有保活风控配置。建议先设置提醒时间和最终动作。",
    "",
    "建议：先用“只通知”跑一轮，确认无误后再改关机/删机。"
  ].join("\n");
}

export function renderAdminPresencePanelKeyboard(policy: PublicAdminPresencePolicy | null): TelegramInlineKeyboardMarkup {
  const enabled = policy && Number(policy.enabled) === 1;
  const rows = [
    [{ text: "✅ 立即打卡", callback_data: "admin_presence:checkin" }],
    [{ text: enabled ? "⏸ 关闭保活" : "🟢 开启保活", callback_data: enabled && policy ? `admin_presence:policy:disable:${policy.id}` : "admin_presence:global:enable" }],
    [{ text: "⏰ 设置提醒时间", callback_data: "admin_presence:global:warn" }, { text: "⏳ 设置最终时间", callback_data: "admin_presence:global:final" }],
    [{ text: "🛡 设置最终动作", callback_data: "admin_presence:global:action" }, { text: "🎯 设置范围", callback_data: "admin_presence:global:scope" }],
    [{ text: "📋 高级策略列表", callback_data: "admin_presence:policies" }],
    [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
  ];
  return { inline_keyboard: rows };
}

export function renderAdminPresenceGlobalWarnText(policy: PublicAdminPresencePolicy | null): string {
  return [
    "⏰ 设置提醒时间",
    "━━━━━━━━━━━━",
    "超过这个时长没有打卡，只发提醒，不碰服务器。",
    "",
    `当前：${policy?.remind_after_minutes && policy.remind_after_minutes > 0 ? formatPolicyMinutes(policy.remind_after_minutes) : "不提醒"}`
  ].join("\n");
}

export function renderAdminPresenceGlobalWarnKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "不提醒", callback_data: "admin_presence:global:warn_to:0" }, { text: "6 小时", callback_data: "admin_presence:global:warn_to:360" }],
    [{ text: "12 小时", callback_data: "admin_presence:global:warn_to:720" }, { text: "24 小时", callback_data: "admin_presence:global:warn_to:1440" }],
    [{ text: "48 小时", callback_data: "admin_presence:global:warn_to:2880" }, { text: "72 小时", callback_data: "admin_presence:global:warn_to:4320" }],
    [{ text: "↩️ 返回保活面板", callback_data: "menu:admin_presence" }]
  ] };
}

export function renderAdminPresenceGlobalFinalText(policy: PublicAdminPresencePolicy | null): string {
  return [
    "⏳ 设置最终动作时间",
    "━━━━━━━━━━━━",
    "超过这个时长没有打卡，就执行设定的最终动作。",
    "",
    `当前：${policy?.final_after_minutes ? formatPolicyMinutes(policy.final_after_minutes) : "未设置"}`
  ].join("\n");
}

export function renderAdminPresenceGlobalFinalKeyboard(remindAfter = 0): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "12 小时", minutes: 720 },
    { text: "24 小时", minutes: 1440 },
    { text: "48 小时", minutes: 2880 },
    { text: "72 小时", minutes: 4320 },
    { text: "7 天", minutes: 10080 },
    { text: "14 天", minutes: 20160 }
  ].filter((option) => option.minutes > remindAfter);
  return { inline_keyboard: [
    ...chunkTimeOptions(options).map((row) => row.map((option) => ({ text: option.text, callback_data: `admin_presence:global:final_to:${option.minutes}` }))),
    [{ text: "↩️ 返回保活面板", callback_data: "menu:admin_presence" }]
  ] };
}

export function renderAdminPresenceGlobalActionText(policy: PublicAdminPresencePolicy | null): string {
  return [
    "🛡 设置最终动作",
    "━━━━━━━━━━━━",
    "这是最终到期后会执行的动作。删机为高危操作，请谨慎。",
    "",
    `当前：${policy ? formatPolicyAction(policy.action) : "未设置"}`
  ].join("\n");
}

export function renderAdminPresenceGlobalActionKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "只通知", callback_data: "admin_presence:global:action_to:notify" }],
    [{ text: "关闭全部服务器", callback_data: "admin_presence:global:action_to:shutdown_all_instances" }],
    [{ text: "删除全部服务器", callback_data: "admin_presence:global:action_to:delete_all_instances" }],
    [{ text: "↩️ 返回保活面板", callback_data: "menu:admin_presence" }]
  ] };
}

export function renderAdminPresenceGlobalScopeText(policy: PublicAdminPresencePolicy | null): string {
  return ["🎯 设置作用范围", "━━━━━━━━━━━━", `当前：${policy ? formatPolicyScope(policy.scope) : "全部账号"}`, "", "老项目式总控默认推荐作用于全部账号。单账号/分组仍可在高级策略里细调。"].join("\n");
}

export function renderAdminPresenceGlobalScopeKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "全部账号", callback_data: "admin_presence:global:scope_to:all" }],
    [{ text: "📋 去高级策略里选择账号/分组", callback_data: "admin_presence:policies" }],
    [{ text: "↩️ 返回保活面板", callback_data: "menu:admin_presence" }]
  ] };
}
