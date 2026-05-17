import type { PublicAccount } from "../services/account-service";
import type { AdminPresenceStatusResult, PublicAdminPresencePolicy } from "../services/admin-presence-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderAdminPresenceMenuText(data: AdminPresenceStatusResult): string {
  return [
    "❤️ 保活打卡",
    "",
    "你定期告诉系统：我还在，这些机器继续保留；如果太久没确认，系统就按预设策略提醒、关机或删除。",
    "",
    `最近确认时间：${data.status.last_checkin_at ?? "从未确认"}`,
    `启用策略组数量：${data.enabled_policy_count}`
  ].join("\n");
}

export function renderAdminPresenceMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "查看策略组", callback_data: "admin_presence:policies" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function renderAdminPresenceCheckinText(data: { status: { last_checkin_at: string | null; current_cycle_id: string | null } }): string {
  return ["✅ 打卡成功", "", `最近确认时间：${data.status.last_checkin_at ?? "-"}`].join("\n");
}

export function renderAdminPresencePoliciesText(policies: PublicAdminPresencePolicy[]): string {
  const lines = ["保活策略组", ""];
  if (policies.length === 0) lines.push("暂无策略组。");
  for (const policy of policies.slice(0, 10)) {
    lines.push(
      `#${policy.id} ${policy.name}`,
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
    [{ text: `#${policy.id} 详情`, callback_data: `admin_presence:policy:detail:${policy.id}` }],
    [Number(policy.enabled) === 1
      ? { text: `#${policy.id} 停用`, callback_data: `admin_presence:policy:disable:${policy.id}` }
      : { text: `#${policy.id} 启用`, callback_data: `admin_presence:policy:enable:${policy.id}` }],
    [{ text: `#${policy.id} 删除`, callback_data: `admin_presence:policy:delete_confirm:${policy.id}` }]
  ]);
  return { inline_keyboard: [[{ text: "新建策略", callback_data: "admin_presence:policy:create" }], ...rows, [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }], [{ text: "返回保活打卡", callback_data: "menu:admin_presence" }]] };
}

export function renderAdminPresencePolicyActionText(action: "enabled" | "disabled", policy: PublicAdminPresencePolicy): string {
  const title = action === "enabled" ? "✅ 保活策略已启用" : "⏸ 保活策略已停用";
  return [title, "", renderAdminPresencePolicyDetailLines(policy).join("\n")].join("\n");
}

export function renderAdminPresencePolicyActionKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看详情", callback_data: `admin_presence:policy:detail:${policy.id}` }],
      [{ text: "返回策略组", callback_data: "admin_presence:policies" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function formatPolicyEnabled(enabled: number | boolean): string {
  return Number(enabled) === 1 ? "启用" : "停用";
}

export function formatPolicyScope(scope: string): string {
  if (scope === "all") return "全部账号";
  if (scope.startsWith("account:")) return `单账号 #${scope.split(":")[1]}`;
  if (scope.startsWith("group:")) return `分组 #${scope.split(":")[1]}`;
  return scope;
}

export function formatPolicyAction(action: string): string {
  if (action === "notify") return "只通知";
  if (action === "shutdown_all_instances") return "关闭全部服务器";
  if (action === "delete_all_instances") return "删除全部服务器";
  return action;
}

export function formatPolicyMinutes(minutes: number | null | undefined): string {
  if (!Number.isFinite(minutes)) return "-";
  const value = Number(minutes);
  if (value % (24 * 60) === 0) return `${value / (24 * 60)} 天后`;
  if (value % 60 === 0) return `${value / 60} 小时后`;
  return `${value} 分钟后`;
}

export function renderAdminPresencePolicyCreateText(): string {
  return ["新增保活策略", "", "请选择策略最终动作。", "", "只通知：到期后只提醒。", "关闭全部服务器：到期后自动关闭所有服务器。", "删除全部服务器：高危，到期后自动删除所有服务器。"].join("\n");
}

export function renderAdminPresencePolicyCreateKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "只通知", callback_data: "admin_presence:policy:create_action:notify" }],
      [{ text: "关闭全部服务器", callback_data: "admin_presence:policy:create_action:shutdown_all_instances" }],
      [{ text: "删除全部服务器", callback_data: "admin_presence:policy:create_action:delete_all_instances" }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyScopeText(action: string): string {
  return ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, "", "请选择作用范围："].join("\n");
}

export function renderAdminPresencePolicyScopeKeyboard(action: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "全部账号", callback_data: `admin_presence:policy:create_scope:${action}:all` }],
      [{ text: "选择账号", callback_data: `admin_presence:policy:create_scope:${action}:account` }],
      [{ text: "选择分组", callback_data: `admin_presence:policy:create_scope:${action}:group` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyAccountText(action: string, accounts: PublicAccount[]): string {
  const lines = ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, "范围：单账号", "", "请选择账号："];
  if (accounts.length === 0) lines.push("暂无可用账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderAdminPresencePolicyAccountKeyboard(action: string, accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `admin_presence:policy:create_account:${action}:${account.id}` }]),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:create_action:${action}` }]
    ]
  };
}

export function renderAdminPresencePolicyGroupText(action: string, groups: Array<{ id: number; name: string }>): string {
  const lines = ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, "范围：分组", "", "请选择分组："];
  if (groups.length === 0) lines.push("暂无可用分组。");
  return lines.join("\n");
}

export function renderAdminPresencePolicyGroupKeyboard(action: string, groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: group.name, callback_data: `admin_presence:policy:create_group:${action}:${group.id}` }]),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:create_action:${action}` }]
    ]
  };
}

export function renderAdminPresencePolicyTimeText(action: string, scope = "all"): string {
  return ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, `范围：${formatPolicyScope(scope)}`, "", "请选择提醒时间：超过多久未打卡时先提醒你。"].join("\n");
}

export function renderAdminPresencePolicyTimeKeyboard(action: string, scope = "all"): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "12 小时后提醒", callback_data: `admin_presence:policy:create_remind:${action}:${scope}:720` }],
      [{ text: "24 小时后提醒", callback_data: `admin_presence:policy:create_remind:${action}:${scope}:1440` }],
      [{ text: "3 天后提醒", callback_data: `admin_presence:policy:create_remind:${action}:${scope}:4320` }],
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyFinalTimeText(action: string, remindAfter: number, scope = "all"): string {
  return ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, `范围：${formatPolicyScope(scope)}`, `提醒时间：${formatPolicyMinutes(remindAfter)}`, "", "请选择最终动作时间：超过多久未打卡时执行最终动作。"].join("\n");
}

export function renderAdminPresencePolicyFinalTimeKeyboard(action: string, remindAfter: number, scope = "all"): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "24 小时后", minutes: 1440 },
    { text: "3 天后", minutes: 4320 },
    { text: "7 天后", minutes: 10080 }
  ].filter((option) => option.minutes > remindAfter);
  return {
    inline_keyboard: [
      ...options.map((option) => [{ text: option.text, callback_data: `admin_presence:policy:create_final:${action}:${scope}:${remindAfter}:${option.minutes}` }]),
      [{ text: "取消", callback_data: "admin_presence:policies" }]
    ]
  };
}

export function renderAdminPresencePolicyNamePrompt(action: string, remindAfter?: number | null, finalAfter?: number | null, scope = "all"): string {
  return ["新增保活策略", "", `最终动作：${formatPolicyAction(action)}`, `范围：${formatPolicyScope(scope)}`, remindAfter ? `提醒时间：${formatPolicyMinutes(remindAfter)}` : null, finalAfter && action !== "notify" ? `最终动作时间：${formatPolicyMinutes(finalAfter)}` : null, "", "请输入策略名称，例如：7天未打卡提醒、24小时未打卡关机。"].filter(Boolean).join("\n");
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
  return ["保活策略详情", "", ...renderAdminPresencePolicyDetailLines(policy)].join("\n");
}

export function renderAdminPresencePolicyDetailKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [Number(policy.enabled) === 1 ? { text: "停用", callback_data: `admin_presence:policy:disable:${policy.id}` } : { text: "启用", callback_data: `admin_presence:policy:enable:${policy.id}` }],
      [{ text: "编辑", callback_data: `admin_presence:policy:edit:${policy.id}` }],
      [{ text: "删除", callback_data: `admin_presence:policy:delete_confirm:${policy.id}` }],
      [{ text: "返回策略组", callback_data: "admin_presence:policies" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderAdminPresencePolicyEditText(policy: PublicAdminPresencePolicy): string {
  return ["编辑保活策略", "", ...renderAdminPresencePolicyDetailLines(policy), "", "请选择要修改的内容："].join("\n");
}

export function renderAdminPresencePolicyEditKeyboard(policy: PublicAdminPresencePolicy): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "修改名称", callback_data: `admin_presence:policy:edit_name:${policy.id}` }],
      [{ text: "修改最终动作", callback_data: `admin_presence:policy:edit_action:${policy.id}` }],
      [{ text: "修改作用范围", callback_data: `admin_presence:policy:edit_scope:${policy.id}` }],
      [{ text: "修改提醒时间", callback_data: `admin_presence:policy:edit_remind:${policy.id}` }],
      policy.action === "notify" ? [] : [{ text: "修改最终动作时间", callback_data: `admin_presence:policy:edit_final:${policy.id}` }],
      [{ text: "返回详情", callback_data: `admin_presence:policy:detail:${policy.id}` }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ].filter((row) => row.length > 0)
  };
}

export function renderAdminPresencePolicyEditActionKeyboard(policyId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "只通知", callback_data: `admin_presence:policy:edit_action_to:${policyId}:notify` }],
      [{ text: "关闭全部服务器", callback_data: `admin_presence:policy:edit_action_to:${policyId}:shutdown_all_instances` }],
      [{ text: "删除全部服务器", callback_data: `admin_presence:policy:edit_action_to:${policyId}:delete_all_instances` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditScopeKeyboard(policyId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "全部账号", callback_data: `admin_presence:policy:edit_scope_to:${policyId}:all` }],
      [{ text: "选择账号", callback_data: `admin_presence:policy:edit_scope_to:${policyId}:account` }],
      [{ text: "选择分组", callback_data: `admin_presence:policy:edit_scope_to:${policyId}:group` }],
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditAccountKeyboard(policyId: number, accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `admin_presence:policy:edit_account_to:${policyId}:${account.id}` }]),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:edit_scope:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditGroupKeyboard(policyId: number, groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.slice(0, 10).map((group) => [{ text: group.name, callback_data: `admin_presence:policy:edit_group_to:${policyId}:${group.id}` }]),
      [{ text: "返回选择范围", callback_data: `admin_presence:policy:edit_scope:${policyId}` }]
    ]
  };
}

export function renderAdminPresencePolicyEditTimeKeyboard(policyId: number, field: "remind" | "final", minMinutes = 0): TelegramInlineKeyboardMarkup {
  const options = [
    { text: "12 小时后", minutes: 720 },
    { text: "24 小时后", minutes: 1440 },
    { text: "3 天后", minutes: 4320 },
    { text: "7 天后", minutes: 10080 }
  ].filter((option) => option.minutes > minMinutes);
  return {
    inline_keyboard: [
      ...options.map((option) => [{ text: option.text, callback_data: `admin_presence:policy:edit_${field}_to:${policyId}:${option.minutes}` }]),
      [{ text: "取消", callback_data: `admin_presence:policy:edit:${policyId}` }]
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
  return { inline_keyboard: [[{ text: "确认删除", callback_data: `admin_presence:policy:delete:${policy.id}` }], [{ text: "取消", callback_data: "admin_presence:policies" }]] };
}

export function renderAdminPresencePolicyDeletedText(policy: PublicAdminPresencePolicy): string {
  return ["✅ 保活策略已删除", "", `策略：#${policy.id} ${policy.name}`].join("\n");
}

function renderAdminPresencePolicyDetailLines(policy: PublicAdminPresencePolicy): string[] {
  return [
    `策略：#${policy.id} ${policy.name}`,
    `状态：${formatPolicyEnabled(policy.enabled)}`,
    `范围：${formatPolicyScope(policy.scope)}`,
    `提醒时间：${formatPolicyMinutes(policy.remind_after_minutes)}`,
    policy.action === "notify" ? "最终动作：无" : `最终动作时间：${formatPolicyMinutes(policy.final_after_minutes)}`,
    `最终动作：${formatPolicyAction(policy.action)}`,
    `创建时间：${policy.created_at}`,
    `更新时间：${policy.updated_at}`
  ];
}
