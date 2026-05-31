import type { ProtectedInstanceRule } from "../services/app-settings-service";
import type { AccountInstancesResult } from "../services/instance-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderProtectionMenuText(rules: ProtectedInstanceRule[]): string {
  const lines = [
    "🛡 保护实例",
    "",
    "被保护的实例会跳过批量关机、批量删机、保活自动关机和保活自动删机。",
    "单台关机 / 删除也会被拦截。",
    "保护规则按 账号 + 实例 ID 精确匹配；也兼容 label 规则。",
    ""
  ];
  if (rules.length === 0) lines.push("当前暂无保护规则。建议先把关键机器加入保护，再开启批量删除或保活自动删机。");
  else rules.forEach((rule, index) => lines.push(`${index + 1}. ${formatProtectionRule(rule)}`));
  return lines.join("\n");
}

export function renderProtectionMenuKeyboard(rules: ProtectedInstanceRule[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "添加保护实例", callback_data: "protect:add" }],
      ...rules.slice(0, 10).map((rule, index) => [{ text: `移除 #${index + 1} ${shortenRule(rule)}`, callback_data: `protect:remove_confirm:${index}` }]),
      [{ text: "返回安全", callback_data: "menu:security" }, { text: "返回更多", callback_data: "menu:more" }]
    ]
  };
}

export function renderProtectionAccountText(accounts: Array<{ id: number; alias: string }>): string {
  const lines = ["🛡 添加保护实例", "", "请选择账号，然后选择要保护的服务器。"];
  if (accounts.length === 0) lines.push("暂无账号，请先添加 Linode 账号。");
  return lines.join("\n");
}

export function renderProtectionAccountKeyboard(accounts: Array<{ id: number; alias: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `protect:account:${account.id}` }]),
      ...(accounts.length === 0 ? [[{ text: "去添加账号", callback_data: "accounts:add" }]] : []),
      [{ text: "返回保护实例", callback_data: "protect:menu" }]
    ]
  };
}

export function renderProtectionInstanceText(data: AccountInstancesResult): string {
  const lines = ["🛡 添加保护实例", "", `账号：#${data.account.id} ${data.account.alias}`, "", "请选择要保护的服务器："];
  if (data.instances.length === 0) lines.push("这个账号下暂无服务器。");
  return lines.join("\n");
}

export function renderProtectionInstanceKeyboard(data: AccountInstancesResult): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...data.instances.slice(0, 10).map((instance) => [{ text: `#${instance.id} ${instance.label}`, callback_data: `protect:add_instance:${data.account.id}:${instance.id}` }]),
      [{ text: "返回账号选择", callback_data: "protect:add" }],
      [{ text: "返回保护实例", callback_data: "protect:menu" }]
    ]
  };
}

export function renderProtectionUpdatedText(rules: ProtectedInstanceRule[]): string {
  return ["✅ 保护实例设置已更新", "", renderProtectionMenuText(rules)].join("\n");
}

export function renderProtectionBlockedText(action: "shutdown" | "delete"): string {
  return [
    "🛡 已拦截保护实例操作",
    "",
    `本次${action === "delete" ? "删除" : "关机"}没有执行。`,
    "原因：该服务器命中了保护实例规则。",
    "",
    "如果确实要操作，请先到 安全 → 保护实例 移除对应保护规则，再重新执行。"
  ].join("\n");
}

function formatProtectionRule(rule: ProtectedInstanceRule): string {
  const parts = [];
  if (rule.account_id) parts.push(`账号 #${rule.account_id}`);
  if (rule.instance_id) parts.push(`实例 #${rule.instance_id}`);
  if (rule.label) parts.push(`Label：${rule.label}`);
  return parts.join(" / ") || "未命名规则";
}

function shortenRule(rule: ProtectedInstanceRule): string {
  if (rule.instance_id) return `#${rule.instance_id}`;
  if (rule.label) return rule.label.length > 18 ? `${rule.label.slice(0, 18)}…` : rule.label;
  if (rule.account_id) return `账号 #${rule.account_id}`;
  return "规则";
}
