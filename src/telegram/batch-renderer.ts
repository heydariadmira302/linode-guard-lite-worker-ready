import type { PublicAccount } from "../services/account-service";
import type { BatchAction, BatchOperationResult } from "../services/batch-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderBatchMenuText(): string {
  return [
    "批量操作",
    "",
    "请选择批量操作范围和动作。",
    "MVP 当前不做二次确认，点击执行入口后会立即执行。"
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
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderBatchAccountsText(action: BatchAction): string {
  return ["批量操作", "", `动作：${action}`, "请选择账号。"].join("\n");
}

export function renderBatchAccountsKeyboard(accounts: PublicAccount[], action: BatchAction): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `batch:account:${action}:${account.id}` }]),
      [{ text: "返回批量操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderBatchResultText(result: BatchOperationResult): string {
  const lines = [
    "批量操作结果",
    "",
    `动作：${result.action}`,
    `范围：${result.scope}`,
    `结果：${result.result}`,
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
  return { inline_keyboard: [[{ text: "返回批量操作", callback_data: "menu:batch" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}
