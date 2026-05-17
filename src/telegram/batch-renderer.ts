import type { PublicAccount } from "../services/account-service";
import type { BatchAction, BatchOperationResult } from "../services/batch-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderBatchMenuText(): string {
  return [
    "批量操作",
    "",
    "请选择批量操作范围和动作。",
    "关机和删除会先进入二次确认，避免误操作。"
  ].join("\n");
}

export function renderBatchMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "单账号批量开机", callback_data: "batch:accounts:boot" }],
      [{ text: "单账号批量关机", callback_data: "batch:accounts:shutdown" }],
      [{ text: "单账号批量删除", callback_data: "batch:accounts:delete" }],
      [{ text: "全部账号批量开机", callback_data: "batch:all:boot" }],
      [{ text: "全部账号批量关机", callback_data: "batch:all:shutdown" }],
      [{ text: "全部账号批量删除", callback_data: "batch:all:delete" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderBatchAccountsText(action: BatchAction): string {
  return ["批量操作", "", `动作：${formatBatchAction(action)}`, "请选择账号。"].join("\n");
}

export function renderBatchAccountsKeyboard(accounts: PublicAccount[], action: BatchAction): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `batch:account:${action}:${account.id}` }]),
      [{ text: "返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchConfirmText(input: { action: BatchAction; scope: "account" | "group" | "all"; accountId?: number; groupId?: number; groupName?: string }): string {
  const risk = input.action === "delete" ? "⚠️ 高危操作：批量删除服务器不可恢复。" : input.action === "shutdown" ? "⚠️ 批量关机会影响当前范围内服务器可用性。" : "确认执行批量开机。";
  return [
    "批量操作确认",
    "",
    risk,
    "",
    `动作：${formatBatchAction(input.action)}`,
    `范围：${formatBatchScope(input.scope, input.accountId, input.groupId, input.groupName)}`,
    "",
    "请确认是否继续。"
  ].join("\n");
}

export function renderBatchConfirmKeyboard(input: { action: BatchAction; scope: "account" | "group" | "all"; accountId?: number; groupId?: number }): TelegramInlineKeyboardMarkup {
  const runCallback = input.scope === "account" ? `batch:account:run:${input.action}:${input.accountId}` : input.scope === "group" ? `batch:group:run:${input.action}:${input.groupId}` : `batch:all:run:${input.action}`;
  const cancelCallback = input.scope === "account" ? `batch:accounts:${input.action}` : input.scope === "group" ? `groups:detail:${input.groupId}` : "menu:batch";
  return {
    inline_keyboard: [
      [{ text: input.action === "delete" ? "确认删除" : "确认执行", callback_data: runCallback }],
      [{ text: "取消", callback_data: cancelCallback }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderBatchResultText(result: BatchOperationResult): string {
  const lines = [
    "批量操作结果",
    "",
    `动作：${formatBatchAction(result.action)}`,
    `范围：${formatBatchScope(result.scope)}`,
    `结果：${formatBatchResult(result.result)}`,
    "",
    `总数：${result.total}`,
    `成功：${result.success}`,
    `失败：${result.failed}`
  ];
  const failedItems = result.items.filter((item) => item.result === "failed");
  if (failedItems.length > 0) {
    lines.push("", "失败详情：");
    for (const item of failedItems.slice(0, 10)) lines.push(`#${item.instance_id} ${item.label}：${item.error_code ?? "UNKNOWN"}`);
    if (failedItems.length > 10) lines.push(`还有 ${failedItems.length - 10} 条失败未展示`);
  }
  return lines.join("\n");
}

export function renderBatchResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回批量操作", callback_data: "menu:batch" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
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
