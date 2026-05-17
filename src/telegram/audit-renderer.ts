import type { AuditLogRecord } from "../storage/audit-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderAuditLogsText(logs: AuditLogRecord[]): string {
  if (logs.length === 0) return "审计日志\n\n暂无审计日志。";
  return [
    "审计日志",
    "",
    ...logs.map((log) => [
      log.created_at,
      `action：${log.action}`,
      `target_type：${log.target_type}`,
      `target_id：${log.target_id ?? "-"}`,
      `risk_level：${log.risk_level}`,
      `result：${log.result}`,
      log.error_code ? `error_code：${log.error_code}` : "error_code：-"
    ].join("\n"))
  ].join("\n\n");
}

export function renderAuditLogsKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "刷新最近审计日志", callback_data: "menu:audit_logs" }],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}
