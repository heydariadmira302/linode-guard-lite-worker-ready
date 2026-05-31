import type { Env } from "../env";
import { sendTelegramAction } from "../telegram/action-sender";
import type { TelegramInlineKeyboardMarkup } from "../telegram/types";
import type { BatchOperationResult } from "./batch-service";
import { getSuperAdminChatId } from "./super-admin-service";
import type { ScheduleRunResult } from "./schedule-service";
import type { AdminPresencePolicyRecord } from "../storage/admin-presence-repository";
import { readTelegramMessageId, recordTelegramAutoDeleteMessage } from "./telegram-message-tracking-service";

export type PresenceFinalAction = "shutdown_all_instances" | "delete_all_instances";

export interface DeploymentUpdateNotificationInput {
  version_id: string;
  version_tag?: string;
  version_timestamp?: string;
  detected_at: string;
}

export class NotificationService {
  constructor(private readonly env: Env) {}

  async notifyScheduleRunResult(result: ScheduleRunResult): Promise<boolean> {
    if (result.executed === 0 || result.items.length === 0) return false;
    return await this.safeSend({
      text: renderScheduleRunNotification(result),
      reply_markup: auditKeyboard([[{ text: "⏰ 查看定时", callback_data: "menu:schedules" }]]),
      purpose: "schedule_run_notification"
    });
  }

  async notifyPresenceFinalAction(input: { policy: AdminPresencePolicyRecord; action: PresenceFinalAction; minutesSinceCheckin: number; batch: BatchOperationResult }): Promise<boolean> {
    return await this.safeSend({
      text: renderPresenceFinalActionNotification(input),
      reply_markup: auditKeyboard([[{ text: "❤️ 查看保活", callback_data: "menu:admin_presence" }]]),
      purpose: "admin_presence_final_notification",
      trackAutoDelete: false
    });
  }

  async notifyDeploymentUpdate(input: DeploymentUpdateNotificationInput): Promise<boolean> {
    return await this.safeSend({
      text: renderDeploymentUpdateNotification(input),
      reply_markup: deploymentKeyboard(input),
      purpose: "deployment_update_notification",
      trackAutoDelete: false
    });
  }

  private async safeSend(message: { text: string; reply_markup?: TelegramInlineKeyboardMarkup; purpose?: string; trackAutoDelete?: boolean }): Promise<boolean> {
    try {
      const chatId = await getSuperAdminChatId(this.env);
      if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return false;
      const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "sendMessage", payload: { chat_id: chatId, text: message.text, reply_markup: message.reply_markup } });
      const messageId = readTelegramMessageId(result);
      if (message.trackAutoDelete !== false && messageId !== null) await recordTelegramAutoDeleteMessage(this.env, { chatId, messageId, direction: "background_notification", purpose: message.purpose });
      return true;
    } catch {
      // 通知失败不能影响真实 Linode 操作，也不能导致 Cron 重复执行。
      return false;
    }
  }
}

function auditKeyboard(prefixRows: TelegramInlineKeyboardMarkup["inline_keyboard"]): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [...prefixRows, [{ text: "📄 查看审计", callback_data: "menu:audit_logs" }], [{ text: "🏠 主菜单", callback_data: "menu:main" }]] };
}

function renderScheduleRunNotification(result: ScheduleRunResult): string {
  const title = result.result === "success" ? "✅ 定时任务已执行" : result.result === "partial_failed" ? "⚠️ 定时任务部分失败" : "❌ 定时任务执行失败";
  const lines = [title, "━━━━━━━━━━━━", `检查 ${result.checked} 个 / 执行 ${result.executed} 个 / 失败 ${result.failed} 个`];
  for (const item of result.items.filter((entry) => entry.result !== "skipped").slice(0, 5)) {
    lines.push("", `#${item.schedule_id} ${item.name}`, `结果：${formatResult(item.result)}`);
    if (item.batch) appendBatchSummary(lines, item.batch);
    if (item.error_code) lines.push(`失败原因：${formatError(item.error_code)}`);
  }
  const extra = result.items.filter((entry) => entry.result !== "skipped").length - 5;
  if (extra > 0) lines.push("", `另有 ${extra} 个任务未展示，可查看审计日志。`);
  return lines.join("\n");
}

function renderPresenceFinalActionNotification(input: { policy: AdminPresencePolicyRecord; action: PresenceFinalAction; minutesSinceCheckin: number; batch: BatchOperationResult }): string {
  const isDelete = input.action === "delete_all_instances";
  const lines = [
    isDelete ? "🚨 保活最终删除已执行" : "⚠️ 保活最终动作已执行",
    "━━━━━━━━━━━━",
    "",
    `策略：#${input.policy.id} ${input.policy.name}`,
    `动作：${formatPresenceAction(input.action)}`,
    `范围：${formatPresenceScope(input.policy.scope)}`,
    `距离上次打卡：${formatMinutes(input.minutesSinceCheckin)}`,
    ""
  ];
  appendBatchSummary(lines, input.batch);
  if (isDelete) lines.push("", "删除通常不可恢复，请尽快查看审计确认结果。");
  return lines.join("\n");
}

function appendBatchSummary(lines: string[], batch: BatchOperationResult): void {
  const skipped = batch.items.filter((item) => item.result === "skipped");
  const failed = batch.items.filter((item) => item.result === "failed");
  lines.push("执行结果", `总数：${batch.total}｜成功：${batch.success}｜失败：${batch.failed}｜保护跳过：${skipped.length}`);
  if (failed.length > 0) {
    lines.push("", "失败：");
    for (const item of failed.slice(0, 10)) lines.push(`- ${item.label || `#${item.instance_id}`}：${formatError(item.error_code)}`);
    if (failed.length > 10) lines.push(`还有 ${failed.length - 10} 条失败未展示`);
  }
  if (skipped.length > 0) {
    lines.push("", "保护跳过：");
    for (const item of skipped.slice(0, 10)) lines.push(`- ${item.label || `#${item.instance_id}`}`);
    if (skipped.length > 10) lines.push(`还有 ${skipped.length - 10} 条保护跳过未展示`);
  }
}

function formatPresenceAction(action: PresenceFinalAction): string {
  return action === "delete_all_instances" ? "批量删除" : "批量关机";
}

function formatPresenceScope(scope: string): string {
  if (scope === "all") return "全部账号";
  if (scope.startsWith("account:")) return `单账号 #${scope.split(":")[1]}`;
  if (scope.startsWith("group:")) return `分组 #${scope.split(":")[1]}`;
  return scope;
}

function formatResult(result: string): string {
  if (result === "success") return "成功";
  if (result === "partial_failed") return "部分失败";
  if (result === "failed") return "失败";
  if (result === "skipped") return "已跳过";
  return result;
}

function formatError(code?: string): string {
  if (!code) return "未知错误";
  if (code === "TOKEN_INVALID") return "Linode Token 无效，请更新账号 Token";
  if (code === "TOKEN_PERMISSION_ERROR") return "Token 权限不足，无法执行该操作";
  if (code === "INSTANCE_NOT_FOUND") return "服务器不存在或不属于该账号";
  if (code === "RATE_LIMITED" || code === "LINODE_RATE_LIMITED") return "Linode API 限流，请稍后重试";
  if (code === "VALIDATION_ERROR") return "已被安全规则拦截或参数不合法";
  if (code === "JOB_FAILED") return "后台任务执行失败";
  if (code === "LINODE_API_ERROR") return "Linode API 请求失败";
  return code;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} 天`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小时`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} 小时`;
  return `${minutes} 分钟`;
}

function renderDeploymentUpdateNotification(input: DeploymentUpdateNotificationInput): string {
  return [
    "✅ Bot 已更新部署",
    "━━━━━━━━━━━━",
    `版本 ID：${shortValue(input.version_id)}`,
    input.version_tag ? `版本标记：${input.version_tag}` : undefined,
    input.version_timestamp ? `版本创建：${input.version_timestamp}` : undefined,
    `检测时间：${input.detected_at}`,
    "",
    "新版 Worker 已上线，你可以发送 /start 或打开菜单检查功能。"
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function deploymentKeyboard(_input: DeploymentUpdateNotificationInput): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "🏠 主菜单", callback_data: "menu:main" }]] };
}

function shortValue(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}
