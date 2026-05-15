import type { PublicAccount } from "../services/account-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderMainMenuText(): string {
  return [
    "🛡 Linode Guard Lite",
    "",
    "账号数：0",
    "服务器数：-",
    "",
    "最近确认：从未确认",
    "账号安全监控：未配置",
    "定时任务：0 个启用",
    "保活策略组：0 个启用"
  ].join("\n");
}

export function renderMainMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "服务器", callback_data: "menu:instances" },
        { text: "账号安全", callback_data: "menu:security" }
      ],
      [
        { text: "保活确认", callback_data: "menu:admin_presence" },
        { text: "定时任务", callback_data: "menu:schedules" }
      ],
      [
        { text: "账号管理", callback_data: "menu:accounts" },
        { text: "审计日志", callback_data: "menu:audit_logs" }
      ],
      [
        { text: "系统自检", callback_data: "menu:diagnostics" },
        { text: "设置", callback_data: "menu:settings" }
      ],
      [{ text: "危险操作", callback_data: "menu:batch" }]
    ]
  };
}

export function renderAccountsMenuText(): string {
  return [
    "账号管理",
    "",
    "当前阶段支持添加、查看、测试、删除 Linode 账号 Token。",
    "核心能力同样可通过 /api/v1/accounts HTTP API 使用。"
  ].join("\n");
}

export function renderAccountsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看账号列表", callback_data: "accounts:list" }],
      [{ text: "添加账号", callback_data: "accounts:add" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
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

export function renderAccountListKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "继续添加账号", callback_data: "accounts:add" }],
      [{ text: "返回账号管理", callback_data: "menu:accounts" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderAccountAddedKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看账号列表", callback_data: "accounts:list" }],
      [{ text: "继续添加账号", callback_data: "accounts:add" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
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
  return { inline_keyboard: [[{ text: "刷新系统自检", callback_data: "menu:diagnostics" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
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
  return { inline_keyboard: [[{ text: "系统自检", callback_data: "menu:diagnostics" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

export function renderSetupPlaceholderText(): string {
  return "🛠 Setup Wizard 可通过 /setup 页面或 /setup 命令使用。";
}
