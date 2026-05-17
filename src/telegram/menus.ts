import type { PublicAccount } from "../services/account-service";
import type { PublicGroup } from "../services/group-service";
import { renderCheckinInlineKeyboard } from "./keyboards";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderMainMenuText(): string {
  return [
    "🛡 Linode Guard Lite",
    "🏠 主菜单",
    "",
    "账号数：0",
    "服务器数：-",
    "",
    "Linode Guard Lite 运维管家已就绪。",
    "请选择功能：",
    "",
    "🖥 服务器",
    "👤 账号",
    "📁 分组",
    "🛡 安全事件",
    "⏰ 定时任务",
    "❤️ 保活打卡",
    "⚙️ 设置"
  ].join("\n");
}

export function renderMainMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return renderCheckinInlineKeyboard();
}

export function renderAccountsMenuText(): string {
  return [
    "👤 账号管理",
    "",
    "可以添加、查看、测试、删除 Linode 账号 Token。",
    "添加账号时会检测 Token，并建立安全基线：历史登录不会通知。",
    "默认分组：未分组"
  ].join("\n");
}

export function renderAccountsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看账号列表", callback_data: "accounts:list" }],
      [{ text: "添加账号", callback_data: "accounts:add" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderAccountListText(accounts: PublicAccount[]): string {
  const lines = ["账号列表", ""];
  if (accounts.length === 0) lines.push("暂无账号。请先添加 Linode API Token。");
  for (const account of accounts) {
    lines.push(
      `#${account.id} ${account.alias}`,
      `状态：${account.status}`,
      `Token：${account.token_fingerprint}`,
      `Token 状态：${account.token_status}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderAccountListKeyboard(accounts: PublicAccount[] = []): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `详情 #${account.id} ${account.alias}`, callback_data: `accounts:detail:${account.id}` }]),
      [{ text: "继续添加账号", callback_data: "accounts:add" }],
      [{ text: "返回账号管理", callback_data: "menu:accounts" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderAccountDetailText(account: PublicAccount): string {
  return [
    "👤 账号详情",
    "",
    `账号：#${account.id} ${account.alias}`,
    `状态：${formatAccountStatus(account.status)}`,
    `Token 状态：${formatTokenStatus(account.token_status)}`,
    `Token 指纹：${account.token_fingerprint}`,
    `分组：${account.group_id ? `#${account.group_id}` : "未分组"}`,
    `安全基线：${account.security_baseline_at ?? "-"}`,
    `创建时间：${account.created_at}`,
    `更新时间：${account.updated_at}`
  ].join("\n");
}

export function renderAccountDetailKeyboard(account: PublicAccount): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "测试 Token", callback_data: `accounts:test:${account.id}` }],
      [{ text: "更新 Token", callback_data: `accounts:update_token:${account.id}` }],
      [{ text: "移动分组", callback_data: `accounts:move_group:${account.id}` }],
      [{ text: "删除账号", callback_data: `accounts:delete_confirm:${account.id}` }],
      [{ text: "返回账号列表", callback_data: "accounts:list" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderAccountDeleteConfirmText(account: PublicAccount): string {
  return [
    "⚠️ 确认删除账号？",
    "",
    `账号：#${account.id} ${account.alias}`,
    "",
    "删除后这个账号不会再参与服务器管理、批量操作、定时任务和安全检查。",
    "不会删除 Linode 服务器，但会停止本 Bot 对该账号的管理。"
  ].join("\n");
}

export function renderAccountDeleteConfirmKeyboard(account: PublicAccount): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "确认删除账号", callback_data: `accounts:delete:${account.id}` }],
      [{ text: "取消", callback_data: `accounts:detail:${account.id}` }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderAccountActionResultText(title: string, account: PublicAccount): string {
  return [title, "", `账号：#${account.id} ${account.alias}`, `状态：${formatAccountStatus(account.status)}`, `Token 状态：${formatTokenStatus(account.token_status)}`, `分组：${account.group_id ? `#${account.group_id}` : "未分组"}`].join("\n");
}

function formatAccountStatus(status: string): string {
  if (status === "active") return "启用";
  if (status === "deleted") return "已删除";
  return status;
}

function formatTokenStatus(status: string): string {
  if (status === "valid") return "可用";
  if (status === "invalid") return "无效";
  if (status === "permission_error") return "权限不足";
  return status;
}

export function renderAccountAddedKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看账号列表", callback_data: "accounts:list" }],
      [{ text: "继续添加账号", callback_data: "accounts:add" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderHelpText(): string {
  return [
    "Linode Guard Lite 是一个 API-first 的轻量 Linode 运维控制面。",
    "",
    "常用入口：",
    "/start 打开主菜单",
    "/setup 部署/初始化向导",
    "/cancel 取消当前流程",
    "/help 查看帮助",
    "",
    "所有核心能力也可以通过 /api/v1/... HTTP API 使用。"
  ].join("\n");
}

export function renderDiagnosticsMenuText(status: string, missingJobs: string[], disabledJobs: string[]): string {
  return [
    "系统自检",
    "",
    `部署状态：${status}`,
    `缺失 Jobs：${missingJobs.length > 0 ? missingJobs.join(", ") : "无"}`,
    `禁用 Jobs：${disabledJobs.length > 0 ? disabledJobs.join(", ") : "无"}`,
    "",
    "详细检查也可以通过 /api/v1/diagnostics/deployment 和 /api/v1/diagnostics/jobs 查看。"
  ].join("\n");
}

export function renderDiagnosticsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "刷新系统自检", callback_data: "menu:diagnostics" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function renderSettingsMenuText(): string {
  return [
    "设置",
    "",
    "MVP 当前通过 Cloudflare Worker Variables、Secrets 和 Setup Wizard 管理配置。",
    "",
    "Secrets：首次 /setup initialize 会自动生成并保存独立的 API_AUTH_TOKEN、Webhook Secret 和加密密钥。",
    "Vars：APP_TIMEZONE、BATCH_CONCURRENCY、OPERATION_LOG_RETENTION_DAYS、LOGIN_EVENT_RETENTION_DAYS。"
  ].join("\n");
}

export function renderSettingsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "系统自检", callback_data: "menu:diagnostics" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] };
}

export function renderGroupsMenuText(groups: PublicGroup[]): string {
  return [
    "📁 分组",
    "",
    groups.length ? groups.map((group) => `${group.is_default ? "⭐️" : "•"} ${group.name}（${group.account_count}）`).join("\n") : "暂无分组。",
    "",
    "默认分组：未分组",
    "一个账号只能属于一个分组。"
  ].join("\n");
}

export function renderGroupsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看分组列表", callback_data: "groups:list" }],
      [{ text: "新建分组", callback_data: "groups:create" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderSetupPlaceholderText(): string {
  return "🛠 Setup Wizard 可通过 /setup 页面或 /setup 命令使用。";
}
