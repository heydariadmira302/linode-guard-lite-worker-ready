import type { SecurityCheckResult } from "../services/security-service";
import type { SecurityEventRecord } from "../storage/events-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";
import { formatAuditError } from "../utils/audit-labels";
import { renderTelegramOperationResult } from "./result-template";

export function renderSecurityMenuText(openEvents: number, recentEvents: SecurityEventRecord[]): string {
  return [
    "🛡 安全事件",
    "━━━━━━━━━━━━",
    "",
    openEvents > 0 ? `需要确认：${openEvents} 条安全事件` : "当前没有未确认安全事件。",
    "",
    "监控范围：Linode / Akamai Cloud 控制台登录记录。",
    "说明：这不是 SSH 登录监控，也不保证覆盖所有 API Token 使用行为。",
    "",
    `最近事件：${recentEvents.length}`
  ].join("\n");
}

export function renderSecurityMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚨 未确认事件", callback_data: "security:events:open" }, { text: "📋 最近事件", callback_data: "security:events" }],
      [{ text: "🔄 手动检查", callback_data: "security:check" }],
      [{ text: "🛡 保护实例", callback_data: "protect:menu" }, { text: "⚙️ 安全设置", callback_data: "security:settings" }],
      [{ text: "🏠 主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderSecurityEventsText(events: SecurityEventRecord[], title = "最近安全事件"): string {
  const lines = [`🛡 ${title}`, "━━━━━━━━━━━━", ""];
  if (events.length === 0) lines.push(title.includes("未确认") ? "暂无未确认安全事件。" : "暂无安全事件。");
  for (const event of events.slice(0, 10)) {
    lines.push(
      `#${event.id} ${formatSecurityEventType(event.type)}`,
      `账号：${event.account_id ?? "-"}`,
      `状态：${formatSecurityEventStatus(event.status)}`,
      `用户：${event.username ?? "-"}`,
      `IP：${event.ip ?? "-"}`,
      `位置：${[event.country, event.region, event.city].filter(Boolean).join(" / ") || "-"}`,
      `时间：${event.occurred_at}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderSecurityEventsKeyboard(events: SecurityEventRecord[] = []): TelegramInlineKeyboardMarkup {
  const openEvents = events.filter((event) => event.status === "open").slice(0, 5);
  return {
    inline_keyboard: [
      ...openEvents.map((event) => [
        { text: "是我", callback_data: `security:confirm:${event.id}` },
        { text: "不是我", callback_data: `security:suspicious:${event.id}` }
      ]),
      [{ text: "手动检查", callback_data: "security:check" }],
      [{ text: "返回安全事件", callback_data: "menu:security" }]
    ]
  };
}

export function renderSecurityCheckResultText(result: SecurityCheckResult): string {
  const failed = result.items.filter((item) => item.result === "failed");
  const failedLines = failed.slice(0, 10).map((item) => `#${item.account_id} ${item.account_alias}：${formatAuditError(item.error_code)}`);
  const title = result.new_security_events > 0 ? "安全检查发现新事件" : "安全检查";
  const lines = [
    renderTelegramOperationResult({
      title,
      status: result.result === "success" ? "success" : result.result === "partial_failed" ? "partial_failed" : "failed",
      fields: [
        { label: "检查账号", value: result.checked_accounts },
        { label: "失败账号", value: result.failed_accounts },
        { label: "新增登录记录", value: result.new_login_events },
        { label: "新增安全事件", value: result.new_security_events }
      ],
      nextStep: result.new_security_events > 0 ? "查看未确认安全事件并确认是否本人操作" : "返回安全事件菜单"
    })
  ];
  if (failedLines.length > 0) lines.push("", "失败账号：", ...failedLines);
  return lines.join("\n");
}

export function renderSecurityCheckResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "查看未确认", callback_data: "security:events:open" }], [{ text: "安全设置", callback_data: "security:settings" }], [{ text: "返回安全事件", callback_data: "menu:security" }]] };
}

export function formatSecurityCheckResult(result: string): string {
  if (result === "success") return "检查完成";
  if (result === "partial_failed") return "部分账号检查失败";
  if (result === "failed") return "检查失败";
  return result;
}

export function formatSecurityEventType(type: string): string {
  if (type === "LOGIN_SUCCESS") return "成功登录";
  if (type === "LOGIN_FAILED") return "登录失败";
  if (type === "TOKEN_INVALID") return "Token 无效";
  if (type === "TOKEN_PERMISSION_ERROR") return "Token 权限不足";
  return type;
}

export function formatSecurityEventStatus(status: string): string {
  if (status === "open") return "未确认";
  if (status === "confirmed") return "已确认：是我";
  if (status === "suspicious") return "已标记：不是我";
  if (status === "closed") return "已关闭";
  return status;
}

export function renderSecurityEventStatusUpdateText(event: SecurityEventRecord): string {
  const lines = [renderTelegramOperationResult({
    title: "更新安全事件",
    status: "success",
    fields: [
      { label: "事件", value: `#${event.id}` },
      { label: "状态", value: formatSecurityEventStatus(event.status) }
    ],
    nextStep: event.status === "suspicious" ? "按风险建议处理账号与 Token" : "返回安全事件列表"
  })];
  if (event.status === "suspicious") {
    lines.push("", "风险建议：", "1. 立即在 Linode / Akamai Cloud 控制台撤销或重置相关 Token。", "2. 检查账号近期登录记录和服务器状态。", "3. 如果不是本人操作，尽快修改账号密码并开启/检查二次验证。");
  }
  return lines.join("\n");
}
