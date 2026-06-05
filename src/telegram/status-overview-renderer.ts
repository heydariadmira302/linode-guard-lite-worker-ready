import type { StatusOverviewResult } from "../services/status-overview-service";
import { formatAuditAction, formatAuditResult, formatAuditTime } from "../utils/audit-labels";
import { formatPolicyAction, formatPolicyMinutes, formatPolicyScope } from "./admin-presence-renderer";
import { formatScheduleAction, formatScheduleScope } from "./schedule-renderer";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderStatusOverviewText(data: StatusOverviewResult, timezone?: string): string {
  const presence = data.admin_presence;
  const lastCheckin = presence?.status.last_checkin_at ? formatAuditTime(presence.status.last_checkin_at, timezone) : "从未打卡";
  const highRiskAudit = data.recent_high_risk_audit;
  const health = getOverviewHealth(data);

  return [
    `${health.icon} 状态总览`,
    "━━━━━━━━━━━━",
    health.text,
    "",
    "🖥 服务器",
    `总数：${data.instances.total}｜运行：${data.instances.running}｜关机：${data.instances.offline}｜异常：${data.instances.other}`,
    data.instances.failed_accounts > 0 ? `账号异常：${data.instances.failed_accounts} 个，请检查 KEY 权限或 Token` : "账号异常：0",
    "",
    "📅 定时计划",
    `启用：${data.schedules.enabled} / ${data.schedules.total}`,
    ...renderScheduleOverviewLines(data),
    "",
    "❤️ 保活",
    `上次打卡：${lastCheckin}`,
    `启用：${presence?.enabled_policy_count ?? 0} 条`,
    ...renderPresencePolicyLines(presence?.policies ?? []),
    "",
    "🛡 安全",
    data.security.open_events > 0 ? `未确认事件：${data.security.open_events}，需要确认` : "未确认事件：0",
    "",
    "📄 高风险操作",
    highRiskAudit ? `最近：${formatAuditAction(highRiskAudit.action)} ${formatAuditResult(highRiskAudit.result)}` : "最近：无",
    "",
    `刷新时间：${formatAuditTime(data.generated_at, timezone)}`
  ].filter(Boolean).join("\n");
}

export function renderStatusOverviewKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🔄 刷新", callback_data: "status:overview" }],
      [{ text: "🖥 服务器", callback_data: "instances:list:all" }, { text: "🛡 安全", callback_data: "menu:security" }],
      [{ text: "📅 定时计划", callback_data: "menu:schedules" }, { text: "❤️ 保活", callback_data: "menu:admin_presence" }],
      [{ text: "📄 审计", callback_data: "menu:audit_logs" }, { text: "🏠 主菜单", callback_data: "menu:main" }]
    ]
  };
}

function renderScheduleOverviewLines(data: StatusOverviewResult): string[] {
  const schedules = data.schedules.recent_schedules ?? [];
  if (schedules.length === 0) return ["暂无定时任务"];
  const lines: string[] = [];
  for (const schedule of schedules.slice(0, 5)) {
    lines.push(`• ${formatScheduleAction(schedule.action).replace(/^\\S+\\s*/, "")}｜${formatCronDailyTime(schedule.cron_expr)}｜${formatScheduleScope(schedule.scope, schedule.account_id, schedule.group_id, schedule.instance_id)}`);
  }
  if (schedules.length > 5) lines.push(`还有 ${schedules.length - 5} 条，点“定时”查看`);
  return lines;
}

function renderPresencePolicyLines(policies: NonNullable<StatusOverviewResult["admin_presence"]>["policies"]): string[] {
  if (policies.length === 0) return ["暂无保活策略"];
  return policies.slice(0, 3).map((policy) => {
    const remind = `${formatPolicyMinutes(policy.remind_after_minutes).replace("后", "")}提醒`;
    const action = policy.action === "notify"
      ? "最终只通知"
      : `${formatPolicyMinutes(policy.final_after_minutes).replace("后", "")}${formatPolicyAction(policy.action).replace(/^\\S+\\s*/, "")}`;
    return `• ${remind}｜${action}｜${formatPolicyScope(policy.scope)}`;
  });
}

function formatCronDailyTime(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length >= 5 && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
    const minute = Number(parts[0]);
    const hour = Number(parts[1]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59) {
      return `每天 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  return `Cron: ${cronExpr}`;
}

function getOverviewHealth(data: StatusOverviewResult): { icon: string; text: string } {
  if (data.security.open_events > 0) return { icon: "⚠️", text: `需要关注：有 ${data.security.open_events} 个未确认安全事件。` };
  if (data.instances.failed_accounts > 0) return { icon: "⚠️", text: `需要关注：有 ${data.instances.failed_accounts} 个账号状态异常。` };
  if (data.instances.other > 0) return { icon: "ℹ️", text: `运行正常，有 ${data.instances.other} 台服务器处于其他状态。` };
  return { icon: "✅", text: "当前正常" };
}
