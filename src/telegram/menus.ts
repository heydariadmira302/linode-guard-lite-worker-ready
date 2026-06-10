import type { PublicAccount } from "../services/account-service";
import type { AppSettings } from "../services/app-settings-service";
import type { PublicGroup } from "../services/group-service";

import type { TelegramInlineKeyboardMarkup } from "./types";
import { renderTelegramOperationResult } from "./result-template";

export function renderMainMenuText(): string {
  return [
    "🛡 Linode Guard Lite",
    "━━━━━━━━━━━━",
    "先按你要做的事进入，不用记功能藏在哪。",
    "",
    "日常最常用：",
    "• 🖥 服务器：查看、开关机、创建 Windows",
    "• ⏰ 定时：每天自动开关机；单台/重启放在高级里",
    "• 👤 账号：添加或更新 Linode Token",
    "",
    "低频工具统一放到「📋 更多」。"
  ].join("\n");
}

export function renderMainMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🖥 服务器", callback_data: "menu:instances" }, { text: "⏰ 定时", callback_data: "menu:schedules" }],
      [{ text: "👤 账号", callback_data: "menu:accounts" }, { text: "🛡 安全", callback_data: "menu:security" }],
      [{ text: "📄 审计", callback_data: "menu:audit_logs" }, { text: "📋 更多", callback_data: "menu:more" }]
    ]
  };
}

export function renderMoreMenuText(): string {
  return [
    "📋 更多功能",
    "━━━━━━━━━━━━",
    "这些是低频管理工具，日常不用先进这里。",
    "",
    "⚡ 批量：批量开关机/删除",
    "📁 分组：整理账号和服务器范围",
    "📄 审计：查操作记录、失败原因、请求编号",
    "🔒 隐私：设置 Telegram 消息自动清理",
    "⚙️ 设置：系统诊断、安全开关和保护规则",
    "🪪 我的ID：查看 Telegram User ID / Chat ID"
  ].join("\n");
}

export function renderMoreMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⚡ 批量", callback_data: "menu:batch" }, { text: "📁 分组", callback_data: "menu:groups" }],
      [{ text: "📄 审计", callback_data: "menu:audit_logs" }, { text: "🔒 隐私", callback_data: "menu:privacy" }],
      [{ text: "📊 总览", callback_data: "menu:status_overview" }, { text: "🪪 我的ID", callback_data: "menu:myid" }],
      [{ text: "⚙️ 设置", callback_data: "menu:settings" }],
      [{ text: "🏠 主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderPrivacyMenuText(settings: Pick<AppSettings, "telegram_auto_delete_minutes">): string {
  return [
    "🔒 隐私清理",
    "━━━━━━━━━━━━",
    `当前策略：${formatAutoDeleteSetting(settings.telegram_auto_delete_minutes)}`,
    "",
    "开启后，Bot 只记录 Telegram 消息 ID，不保存消息正文。",
    "主要清理你的操作消息、Bot 发出的菜单、通知和操作结果。",
    "Token 等敏感输入会尽量即时删除，不依赖这里。",
    "",
    "注意：",
    "• Telegram 通常只允许删除 48 小时内的消息",
    "• 用户发给 Bot 的普通消息，Telegram 可能不允许 Bot 删除",
    "• 高风险通知建议保留足够时间方便追溯"
  ].join("\n");
}

export function renderPrivacyMenuKeyboard(settings: Pick<AppSettings, "telegram_auto_delete_minutes">): TelegramInlineKeyboardMarkup {
  const current = settings.telegram_auto_delete_minutes;
  const label = (minutes: number, text: string) => current === minutes ? `✅ ${text}` : text;
  return {
    inline_keyboard: [
      [{ text: label(1, "1分钟"), callback_data: "privacy:auto_delete:1" }, { text: label(5, "5分钟"), callback_data: "privacy:auto_delete:5" }],
      [{ text: label(15, "15分钟"), callback_data: "privacy:auto_delete:15" }, { text: label(60, "1小时"), callback_data: "privacy:auto_delete:60" }],
      [{ text: label(1440, "24小时"), callback_data: "privacy:auto_delete:1440" }, { text: label(0, "关闭"), callback_data: "privacy:auto_delete:off" }],
      [{ text: "🧹 立即清理一次", callback_data: "privacy:cleanup_now" }],
      [{ text: "↩️ 返回更多", callback_data: "menu:more" }]
    ]
  };
}

export function renderPrivacyCleanupResultText(result: { deleted_telegram_messages: number; failed_telegram_messages: number }): string {
  return [
    "🧹 隐私清理完成",
    "━━━━━━━━━━━━",
    `已删除：${result.deleted_telegram_messages} 条`,
    `失败：${result.failed_telegram_messages} 条`,
    "",
    "失败通常是因为消息已不存在、超过 Telegram 可删除时间，或 Bot 没有删消息权限。"
  ].join("\n");
}

function formatAutoDeleteSetting(minutes: number): string {
  if (minutes <= 0) return "关闭";
  if (minutes < 60) return `${minutes} 分钟后自动删除`;
  if (minutes % 1440 === 0) return `${minutes / 1440} 天后自动删除`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时后自动删除`;
  return `${minutes} 分钟后自动删除`;
}

export function renderAccountsMenuText(): string {
  return [
    "👤 账号管理",
    "━━━━━━━━━━━━",
    "管理接入 Bot 的 Linode Token。",
    "",
    "建议：",
    "• 一个真实 Linode 账号尽量只保留一个 Token",
    "• 添加后会建立安全基线，历史登录不会打扰",
    "• 删除这里只是移出 Bot，不会删除 Linode 服务器"
  ].join("\n");
}

export function renderAccountsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "📋 查看账号列表", callback_data: "accounts:list" }],
      [{ text: "➕ 添加账号", callback_data: "accounts:add" }],
      [{ text: "📁 分组管理", callback_data: "menu:groups" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderAccountListText(accounts: PublicAccount[]): string {
  const lines = ["👤 账号列表", "━━━━━━━━━━━━", `共 ${accounts.length} 个账号`, ""];
  if (accounts.length === 0) lines.push("暂无账号。请先添加 Linode API Token。");
  for (const account of accounts) {
    lines.push(
      `#${account.id} ${account.alias}`,
      `状态：${formatAccountStatus(account.status)}`,
      `分组：${account.group_name ?? (account.group_id ? `#${account.group_id}` : "未分组")}`,
      `Token：${formatTokenStatus(account.token_status)}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderAccountListKeyboard(accounts: PublicAccount[] = []): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `👤 ${account.alias}`, callback_data: `accounts:detail:${account.id}` }]),
      [{ text: "➕ 继续添加账号", callback_data: "accounts:add" }],
      [{ text: "↩️ 返回账号管理", callback_data: "menu:accounts" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderAccountDetailText(account: PublicAccount): string {
  return [
    "👤 账号详情",
    "━━━━━━━━━━━━",
    `账号：#${account.id} ${account.alias}`,
    `状态：${formatAccountStatus(account.status)}`,
    `分组：${account.group_name ?? (account.group_id ? `#${account.group_id}` : "未分组")}`,
    "",
    `Token：${formatTokenStatus(account.token_status)}`,
    "",
    "常用操作：查看服务器、改名、更新 Token、移动分组。"
  ].join("\n");
}

export function renderAccountDetailKeyboard(account: PublicAccount): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🖥 查看该账号服务器", callback_data: `instances:list:account:${account.id}` }],
      [{ text: "✏️ 修改账号名", callback_data: `accounts:rename:${account.id}` }, { text: "🔍 测试 Token", callback_data: `accounts:test:${account.id}` }],
      [{ text: "🔑 更新 Token", callback_data: `accounts:update_token:${account.id}` }],
      [{ text: "📁 移动分组", callback_data: `accounts:move_group:${account.id}` }],
      [{ text: "🚨 从 Bot 删除账号", callback_data: `accounts:delete_confirm:${account.id}` }],
      [{ text: "↩️ 返回账号列表", callback_data: "accounts:list" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderAccountDeleteConfirmText(account: PublicAccount): string {
  return [
    "⚠️ 确认从 Bot 删除账号？",
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
      [{ text: "🚨 确认从 Bot 删除账号", callback_data: `accounts:delete:${account.id}` }],
      [{ text: "❌ 取消", callback_data: `accounts:detail:${account.id}` }]
    ]
  };
}

export function renderAccountActionResultText(title: string, account: PublicAccount): string {
  return renderTelegramOperationResult({
    title: normalizeResultTitle(title, "账号操作"),
    status: "success",
    fields: [
      { label: "账号", value: `#${account.id} ${account.alias}` },
      { label: "账号状态", value: formatAccountStatus(account.status) },
      { label: "Token 状态", value: formatTokenStatus(account.token_status) },
      { label: "分组", value: account.group_name ?? (account.group_id ? `#${account.group_id}` : "未分组") }
    ],
    nextStep: "可返回账号详情继续管理，或查看审计日志确认记录"
  });
}

function normalizeResultTitle(title: string, fallback: string): string {
  return title.replace(/^[✅✔️⚠️🚨🗑️🔄⏱️\s]+/u, "").trim() || fallback;
}

function formatAccountStatus(status: string): string {
  if (status === "active") return "启用";
  if (status === "deleted") return "已删除";
  return status ? "未知状态" : "未知";
}

function formatTokenStatus(status: string): string {
  if (status === "valid") return "可用";
  if (status === "invalid") return "无效";
  if (status === "permission_error") return "权限不足";
  if (status === "unknown") return "未知";
  return status ? "未知状态" : "未知";
}

export function renderAccountAddedKeyboard(groupId?: number | null): TelegramInlineKeyboardMarkup {
  const continueCallback = groupId && groupId > 1 ? `accounts:add:to_group:${groupId}` : "accounts:add";
  const backCallback = groupId && groupId > 1 ? `groups:detail:${groupId}` : "menu:accounts";
  return {
    inline_keyboard: [
      [{ text: groupId && groupId > 1 ? "继续添加到本组" : "继续添加账号", callback_data: continueCallback }],
      [{ text: "查看账号列表", callback_data: "accounts:list" }],
      [{ text: groupId && groupId > 1 ? "返回分组详情" : "返回账号管理", callback_data: backCallback }, { text: "返回主菜单", callback_data: "menu:main" }]
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

export function renderDiagnosticsMenuText(status: string, missingJobs: string[], disabledJobs: string[], options: { bootSafetyMode?: string; botManagedOfflineCount?: number; failedChecks?: string[] } = {}): string {
  return [
    "🩺 系统自检 / 诊断中心",
    "",
    `部署状态：${formatDiagnosticsStatus(status)}`,
    `失败检查：${options.failedChecks && options.failedChecks.length > 0 ? options.failedChecks.join(", ") : "无"}`,
    `缺失 Jobs：${missingJobs.length > 0 ? missingJobs.join(", ") : "无"}`,
    `禁用 Jobs：${disabledJobs.length > 0 ? disabledJobs.join(", ") : "无"}`,
    "",
    "Boot safety：",
    `模式：${formatBootSafetyMode(options.bootSafetyMode ?? "bot_managed_only")}`,
    `Bot 关停待开机实例：${options.botManagedOfflineCount ?? 0} 台`,
    "",
    "详细检查也可以通过 /api/v1/diagnostics/deployment 和 /api/v1/diagnostics/jobs 查看。"
  ].join("\n");
}

export function renderDiagnosticsMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "刷新系统自检", callback_data: "menu:diagnostics" }], [{ text: "返回设置", callback_data: "menu:settings" }], [{ text: "返回主菜单", callback_data: "menu:main" }]] };
}

export function renderSettingsMenuText(settings?: Pick<AppSettings, "dangerous_action_cooldown_enabled">): string {
  return [
    "⚙️ 设置",
    "━━━━━━━━━━━━",
    "发布版只保留必要开关，避免配置过重。",
    "",
    `高危操作冷却：${settings?.dangerous_action_cooldown_enabled === false ? "关闭" : "开启"}`,
    "",
    "说明：",
    "• 高危操作冷却用于防止重复点击删除、关机、重启、批量操作",
    "• 隐私清理控制 Telegram 消息自动删除",
    "• 系统自检用于发布后排查部署、密钥、任务状态",
    "",
    "Secrets 和 Vars 仍通过 Cloudflare / Setup Wizard 管理。"
  ].join("\n");
}

export function renderSettingsMenuKeyboard(settings?: Pick<AppSettings, "dangerous_action_cooldown_enabled">): TelegramInlineKeyboardMarkup {
  const cooldownEnabled = settings?.dangerous_action_cooldown_enabled !== false;
  return {
    inline_keyboard: [
      [{ text: cooldownEnabled ? "关闭高危操作冷却" : "开启高危操作冷却", callback_data: `settings:danger_cooldown:${cooldownEnabled ? "off" : "on"}` }],
      [{ text: "🔒 隐私清理", callback_data: "menu:privacy" }],
      [{ text: "系统自检 / 诊断中心", callback_data: "menu:diagnostics" }],
      [{ text: "🪪 我的ID", callback_data: "menu:myid" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

function formatDiagnosticsStatus(status: string): string {
  if (status === "ok") return "正常";
  if (status === "failed") return "异常";
  if (status === "degraded") return "部分异常";
  return status ? "未知状态" : "未知";
}

function formatBootSafetyMode(mode: string): string {
  if (mode === "all_offline") return "开机所有离线实例";
  return "只开机 Bot 关停的实例";
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
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderSetupPlaceholderText(): string {
  return "🛠 Setup Wizard 可通过 /setup 页面或 /setup 命令使用。";
}


export function renderMyIdText(data: { userId: string; username?: string | null; firstName?: string | null; lastName?: string | null; languageCode?: string | null; chatId: string }): string {
  const username = data.username ? `@${data.username}` : "无用户名";
  return [
    username,
    `ID：\`${data.userId}\``,
    `名：${data.firstName || "-"}`,
    `姓：${data.lastName || "-"}`,
    `语言：${data.languageCode || "-"}`,
    `Chat ID：\`${data.chatId}\``
  ].join("\n");
}

export function renderMyIdKeyboard(data: { userId: string; username?: string | null; chatId: string }): TelegramInlineKeyboardMarkup {
  const username = data.username ? `@${data.username}` : "无用户名";
  return { inline_keyboard: [
    [{ text: username, copy_text: { text: username } }],
    [{ text: data.userId, copy_text: { text: data.userId } }],
    [{ text: data.chatId, copy_text: { text: data.chatId } }],
    [{ text: "↩️ 返回更多", callback_data: "menu:more" }]
  ] };
}
