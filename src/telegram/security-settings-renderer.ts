import type { PublicAccount } from "../services/account-service";
import type { SecuritySettings } from "../services/security-settings-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderSecuritySettingsText(settings: SecuritySettings): string {
  return [
    "🛡 安全设置",
    "",
    `安全检查：${settings.enabled ? "启用" : "停用"}`,
    `IP Geo / ASN：${settings.ip_geo_enabled ? "启用" : "停用"}`,
    `IP 白名单：${settings.ip_allowlist.length ? settings.ip_allowlist.join(", ") : "未设置"}`,
    `允许国家：${settings.allowed_countries.length ? settings.allowed_countries.join(", ") : "未限制"}`,
    `禁止国家：${settings.blocked_countries.length ? settings.blocked_countries.join(", ") : "未设置"}`,
    `夜间登录策略：${settings.night_login_enabled ? `${settings.night_start}-${settings.night_end} ${settings.timezone}` : "停用"}`,
    `Token 错误去重：${settings.token_error_dedupe_minutes} 分钟`,
    `自动生成 Linode Token：${settings.auto_generate_linode_token_enabled ? "启用" : "停用"}`,
    `自动 Token scopes：${settings.auto_generated_token_scopes}`,
    `自动 Token 有效期：${settings.auto_generated_token_expiry_days ? `${settings.auto_generated_token_expiry_days} 天` : "不设置"}`,
    "",
    "白名单、国家策略等高级配置可通过 HTTP API 更新；Telegram 先提供常用开关和自动换 Token 入口。"
  ].join("\n");
}

export function renderSecuritySettingsKeyboard(settings: SecuritySettings): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: settings.auto_generate_linode_token_enabled ? "停用自动生成 Token" : "启用自动生成 Token", callback_data: `security:settings:auto_token:${settings.auto_generate_linode_token_enabled ? "off" : "on"}` }],
    [{ text: settings.ip_geo_enabled ? "停用 IP Geo / ASN" : "启用 IP Geo / ASN", callback_data: `security:settings:ip_geo:${settings.ip_geo_enabled ? "off" : "on"}` }],
    [{ text: settings.night_login_enabled ? "停用夜间登录策略" : "启用夜间登录策略", callback_data: `security:settings:night:${settings.night_login_enabled ? "off" : "on"}` }],
    [{ text: "自动生成 Token", callback_data: "security:token:accounts" }],
    [{ text: "返回安全事件", callback_data: "menu:security" }]
  ] };
}

export function renderSecurityTokenAccountsText(accounts: PublicAccount[]): string {
  return ["🔁 自动生成 Linode Token", "", accounts.length ? "请选择要自动换 Token 的账号。" : "暂无账号，请先添加 Linode 账号。", "", "新 Token 会由 Linode API 创建，Bot 只保存加密后的新 Token，不会在 Telegram 回显明文。"].join("\n");
}

export function renderSecurityTokenAccountsKeyboard(accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `security:token:confirm:${account.id}` }]),
    ...(accounts.length === 0 ? [[{ text: "去添加账号", callback_data: "accounts:add" }]] : []),
    [{ text: "返回安全设置", callback_data: "security:settings" }]
  ] };
}

export function renderSecurityTokenConfirmText(account: PublicAccount): string {
  return ["⚠️ 确认自动生成新 Linode Token？", "", `账号：#${account.id} ${account.alias}`, "", "执行后会调用 Linode API 创建新的 Personal Access Token，并替换 Bot 当前保存的 Token。", "旧 Token 不会在本步骤自动撤销；如需撤销，请到 Linode 后台确认。"].join("\n");
}

export function renderSecurityTokenConfirmKeyboard(account: PublicAccount): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "确认生成并替换", callback_data: `security:token:generate:${account.id}` }],
    [{ text: "取消", callback_data: "security:token:accounts" }],
    [{ text: "返回安全设置", callback_data: "security:settings" }]
  ] };
}

export function renderSecurityTokenGeneratedText(data: { account_id: number; alias: string; token_fingerprint: string; token_label: string; token_id: number | null; security_baseline_at: string }): string {
  return ["✅ 新 Linode Token 已生成并保存", "", `账号：#${data.account_id} ${data.alias}`, `Token 标签：${data.token_label}`, `Token 指纹：${data.token_fingerprint}`, `安全基线：${formatSecurityTime(data.security_baseline_at)}`, "", "旧 Token 不会自动撤销，如不再使用，建议到 Linode 后台手动删除。"].join("\n");
}

function formatSecurityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace("/", "-");
}

export function renderSecurityTokenGeneratedKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "返回安全设置", callback_data: "security:settings" }], [{ text: "返回账号列表", callback_data: "accounts:list" }]] };
}
