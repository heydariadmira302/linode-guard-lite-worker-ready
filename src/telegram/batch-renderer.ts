import type { PublicAccount } from "../services/account-service";
import type { PublicGroup } from "../services/group-service";
import type { BatchAction, BatchOperationResult } from "../services/batch-service";
import type { TelegramInlineKeyboardMarkup } from "./types";
import { formatAuditError } from "../utils/audit-labels";

export function renderBatchMenuText(): string {
  return [
    "⚡ 批量操作",
    "",
    "这里处理多台服务器。为避免误触，先选择范围，再选择动作。",
    "",
    "建议优先从账号/分组详情进入批量操作；全局批量操作请谨慎使用。",
    "",
    "批量删除属于高危操作，会进入独立确认流程。"
  ].join("\n");
}

export function renderBatchMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "👤 单账号批量操作", callback_data: "batch:scope:account" }],
      [{ text: "📁 分组批量操作", callback_data: "batch:scope:group" }],
      [{ text: "🌐 全部账号批量操作", callback_data: "batch:scope:all" }],
      [{ text: "🚨 批量删除", callback_data: "batch:delete_menu" }],
      [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }, { text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderBatchScopeActionText(scope: "account" | "group" | "all"): string {
  const scopeText = scope === "account" ? "单账号" : scope === "group" ? "分组" : "全部账号";
  return ["⚡ 批量操作", "", `范围：${scopeText}`, "", "请选择动作："].join("\n");
}

export function renderBatchScopeActionKeyboard(scope: "account" | "group" | "all"): TelegramInlineKeyboardMarkup {
  const bootCallback = scope === "account" ? "batch:accounts:boot" : scope === "group" ? "batch:groups:boot" : "batch:all:boot";
  const shutdownCallback = scope === "account" ? "batch:accounts:shutdown" : scope === "group" ? "batch:groups:shutdown" : "batch:all:shutdown";
  return {
    inline_keyboard: [
      [{ text: "✅ 批量开机", callback_data: bootCallback }],
      [{ text: "⚠️ 批量关机", callback_data: shutdownCallback }],
      [{ text: "↩️ 返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchDeleteMenuText(): string {
  return ["⚠️ 批量删除", "", "批量删除服务器通常无法恢复。", "", "请选择删除范围，随后还需要二次确认并发送 DELETE 才会执行。"].join("\n");
}

export function renderBatchDeleteMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚨 删除单账号服务器", callback_data: "batch:accounts:delete" }],
      [{ text: "🚨 删除分组服务器", callback_data: "batch:groups:delete" }],
      [{ text: "🚨 删除全部账号服务器", callback_data: "batch:all:delete" }],
      [{ text: "↩️ 返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchAccountsText(action: BatchAction): string {
  return ["⚡ 单账号批量操作", "", `动作：${formatBatchAction(action)}`, "请选择要操作的账号。"].join("\n");
}

export function renderBatchAccountsKeyboard(accounts: PublicAccount[], action: BatchAction): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `batch:account:${action}:${account.id}` }]),
      [{ text: "返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchGroupsText(action: BatchAction, groups: PublicGroup[]): string {
  return [
    "⚡ 分组批量操作",
    "",
    `动作：${formatBatchAction(action)}`,
    groups.length ? "请选择要操作的分组。" : "暂无分组。请先创建分组或把账号加入分组。"
  ].join("\n");
}

export function renderBatchGroupsKeyboard(groups: PublicGroup[], action: BatchAction): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.map((group) => [{ text: `${group.name}（${group.account_count} 个账号）`, callback_data: `batch:group:${action}:${group.id}` }]),
      ...(groups.length === 0 ? [[{ text: "去新建分组", callback_data: "groups:create" }]] : []),
      [{ text: "返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchConfirmText(input: { action: BatchAction; scope: "account" | "group" | "all"; accountId?: number; groupId?: number; groupName?: string; protectedCount?: number }): string {
  const risk = input.action === "delete" ? "⚠️ 高危操作：批量删除服务器不可恢复。" : input.action === "shutdown" ? "⚠️ 批量关机会影响当前范围内服务器可用性。" : "确认执行批量开机。";
  const protectedLine = input.action === "boot" ? "" : `保护实例：预计至少跳过 ${input.protectedCount ?? 0} 条保护规则命中的实例`;
  return [
    input.action === "delete" ? "⚠️ 批量删除预览" : "⚡ 批量操作确认",
    "",
    risk,
    "",
    `动作：${formatBatchAction(input.action)}`,
    `范围：${formatBatchScope(input.scope, input.accountId, input.groupId, input.groupName)}`,
    protectedLine,
    "",
    input.action === "delete" ? "删除需要二次确认。请点击下方按钮后，再发送 DELETE 才会真正执行。" : "请确认是否继续。"
  ].filter(Boolean).join("\n");
}

export function renderBatchConfirmKeyboard(input: { action: BatchAction; scope: "account" | "group" | "all"; accountId?: number; groupId?: number }): TelegramInlineKeyboardMarkup {
  const runCallback = input.scope === "account" ? `batch:account:run:${input.action}:${input.accountId}` : input.scope === "group" ? `batch:group:run:${input.action}:${input.groupId}` : `batch:all:run:${input.action}`;
  const armCallback = input.scope === "account" ? `batch:account:arm_delete:${input.accountId}` : input.scope === "group" ? `batch:group:arm_delete:${input.groupId}` : "batch:all:arm_delete";
  const cancelCallback = input.scope === "account" ? `batch:accounts:${input.action}` : input.scope === "group" ? `groups:detail:${input.groupId}` : "menu:batch";
  return {
    inline_keyboard: [
      [{ text: input.action === "delete" ? "⚠️ 我知道风险，继续" : "✅ 确认执行", callback_data: input.action === "delete" ? armCallback : runCallback }],
      [{ text: "❌ 取消", callback_data: cancelCallback }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderBatchDeleteArmedText(input: { scope: "account" | "group" | "all"; accountId?: number; groupId?: number; groupName?: string; protectedCount?: number }): string {
  return [
    "⚠️ 最后二次确认",
    "",
    "你即将执行批量删除。删除后通常无法恢复。",
    `范围：${formatBatchScope(input.scope, input.accountId, input.groupId, input.groupName)}`,
    `保护实例：预计至少跳过 ${input.protectedCount ?? 0} 条保护规则命中的实例`,
    "",
    "请直接发送：DELETE",
    "发送其他内容不会执行删除，可发送 /cancel 取消。"
  ].join("\n");
}

export function renderBatchDeleteArmedKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "❌ 取消", callback_data: "menu:batch" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function renderBatchResultText(result: BatchOperationResult, requestId?: string): string {
  const title = result.action === "delete" ? "🚨 批量删除结果" : result.action === "shutdown" ? "⚠️ 批量关机结果" : "✅ 批量操作结果";
  const skippedItems = result.items.filter((item) => item.result === "skipped");
  const failedItems = result.items.filter((item) => item.result === "failed");
  const lines = [
    title,
    "",
    `动作：${formatBatchAction(result.action)}`,
    `范围：${formatBatchScope(result.scope)}`,
    `结果：${formatBatchResult(result.result)}`,
    requestId ? `请求编号：${requestId}` : "",
    "",
    "执行结果：",
    `总数：${result.total}`,
    `成功：${result.success}`,
    `失败：${result.failed}`,
    `跳过保护：${skippedItems.length}`
  ].filter(Boolean);
  if (failedItems.length > 0) {
    lines.push("", "失败详情：");
    for (const item of failedItems.slice(0, 10)) lines.push(`#${item.instance_id} ${item.label}：${formatBatchError(item.error_code)}`);
    if (failedItems.length > 10) lines.push(`还有 ${failedItems.length - 10} 条失败未展示，请查看审计日志。`);
  }
  if (skippedItems.length > 0) {
    lines.push("", "保护跳过：");
    for (const item of skippedItems.slice(0, 10)) lines.push(`#${item.instance_id} ${item.label}`);
    if (skippedItems.length > 10) lines.push(`还有 ${skippedItems.length - 10} 条保护跳过未展示，请查看审计日志。`);
  }
  if (result.action === "delete") lines.push("", "⚠️ 删除通常不可恢复，请查看审计日志确认最终结果。");
  return lines.join("\n");
}

export function renderBatchResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "📄 查看审计日志", callback_data: "menu:audit_logs" }], [{ text: "↩️ 返回批量操作", callback_data: "menu:batch" }], [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]] };
}

export function formatBatchAction(action: string): string {
  if (action === "boot") return "开机";
  if (action === "shutdown") return "关机";
  if (action === "delete") return "删除";
  return action;
}

export function formatBatchScope(scope: string, accountId?: number, groupId?: number, groupName?: string): string {
  if (scope === "all") return "全部账号";
  if (scope === "account") return accountId ? `单账号 #${accountId}` : "单账号";
  if (scope === "group") return groupName ? `分组 ${groupName}` : groupId ? `分组 #${groupId}` : "分组";
  return scope;
}

export function formatBatchResult(result: string): string {
  if (result === "success") return "全部成功";
  if (result === "partial_failed") return "部分失败";
  if (result === "failed") return "全部失败";
  return result;
}

export function formatBatchError(code?: string): string {
  if (!code) return "未知错误";
  if (code === "TOKEN_INVALID") return "Linode Token 无效，请更新账号 Token";
  if (code === "TOKEN_PERMISSION_ERROR") return "Token 权限不足，无法执行该操作";
  if (code === "INSTANCE_NOT_FOUND") return "服务器不存在或不属于该账号";
  if (code === "RATE_LIMITED") return "请求过于频繁，请稍后重试";
  if (code === "LINODE_API_ERROR") return "Linode API 请求失败，请稍后重试或检查 Token 权限";
  if (code === "VALIDATION_ERROR") return "已被安全规则拦截或参数不合法";
  if (code === "CONFIG_MISSING") return "系统配置缺失，请检查 Worker / D1 配置";
  return formatAuditError(code);
}
