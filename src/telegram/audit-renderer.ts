import type { AuditLogRecord } from "../storage/audit-repository";
import { formatAuditAction, formatAuditActor, formatAuditError, formatAuditResult, formatAuditRiskLevel, formatAuditSource, formatAuditTargetType, formatAuditTime } from "../utils/audit-labels";
import type { TelegramInlineKeyboardMarkup } from "./types";

type RenderableAuditLog = AuditLogRecord & Partial<{
  action_label: string;
  target_type_label: string;
  risk_level_label: string;
  result_label: string;
  error_message: string | null;
  actor_label: string;
  source_label: string;
}>;

export type AuditLogViewState = {
  limit: number;
  offset: number;
  risk_level?: string | null;
  result?: string | null;
  target_type?: string | null;
};

export function renderAuditLogsText(logs: RenderableAuditLog[], timezone = "Asia/Shanghai", state: Partial<AuditLogViewState> = {}): string {
  const limit = state.limit ?? logs.length;
  const offset = state.offset ?? 0;
  const filter = describeAuditFilter(state);
  if (logs.length === 0) {
    return [
      "📄 审计日志",
      "",
      `当前筛选：${filter}`,
      "暂无审计日志。"
    ].join("\n");
  }
  return [
    "📄 审计日志",
    "",
    "用途：记录谁在什么时间做了什么操作、结果如何。出现误操作、失败或服务器状态异常时，可以用这里的请求编号和错误原因排查。",
    `当前筛选：${filter}`,
    `分页：每页 ${limit} 条，当前从第 ${offset + 1} 条开始。`,
    "",
    ...logs.map((log) => [
      `时间：${formatAuditTime(log.created_at, timezone)}`,
      `操作：${log.action_label ?? formatAuditAction(log.action)}`,
      `对象：${log.target_type_label ?? formatAuditTargetType(log.target_type)} ${log.target_id ?? "-"}`,
      `来源：${log.source_label ?? formatAuditSource(log.source)}`,
      `操作者：${log.actor_label ?? formatAuditActor(log.actor)}`,
      `风险：${log.risk_level_label ?? formatAuditRiskLevel(log.risk_level)}`,
      `结果：${log.result_label ?? formatAuditResult(log.result)}`,
      `失败原因：${log.error_message ?? formatAuditError(log.error_code)}`,
      `请求编号：${log.request_id}`
    ].join("\n"))
  ].join("\n\n");
}

export function renderAuditLogsKeyboard(state: Partial<AuditLogViewState> = {}): TelegramInlineKeyboardMarkup {
  const limit = state.limit ?? 5;
  const offset = state.offset ?? 0;
  return {
    inline_keyboard: [
      [{ text: "🔄 刷新", callback_data: encodeAuditCallback(state, offset) }],
      [
        { text: "🚨 高风险", callback_data: "audit_logs:risk:critical:0" },
        { text: "⚠️ 失败", callback_data: "audit_logs:result:failed:0" }
      ],
      [
        { text: "🖥 服务器", callback_data: "audit_logs:target:instance:0" },
        { text: "⏰ 定时", callback_data: "audit_logs:target:power_schedule:0" },
        { text: "❤️ 保活", callback_data: "audit_logs:target:admin_presence_policy:0" }
      ],
      [
        { text: "全部", callback_data: "audit_logs:all:0" },
        { text: "上一页", callback_data: encodeAuditCallback(state, Math.max(0, offset - limit)) },
        { text: "下一页", callback_data: encodeAuditCallback(state, offset + limit) }
      ],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

function describeAuditFilter(state: Partial<AuditLogViewState>): string {
  if (state.risk_level === "critical") return "只看高风险操作";
  if (state.result === "failed") return "只看失败记录";
  if (state.target_type === "instance") return "只看服务器相关";
  if (state.target_type === "power_schedule") return "只看定时任务";
  if (state.target_type === "admin_presence_policy") return "只看保活策略";
  return "全部";
}

function encodeAuditCallback(state: Partial<AuditLogViewState>, offset: number): string {
  if (state.risk_level) return `audit_logs:risk:${state.risk_level}:${offset}`;
  if (state.result) return `audit_logs:result:${state.result}:${offset}`;
  if (state.target_type) return `audit_logs:target:${state.target_type}:${offset}`;
  return `audit_logs:all:${offset}`;
}
