import type { Env } from "../env";
import { AdminPresenceRepository, type AdminPresencePolicyRecord } from "../storage/admin-presence-repository";
import { JobsRepository } from "../storage/jobs-repository";
import { AuditRepository } from "../storage/audit-repository";
import { ErrorCode } from "../errors/error-codes";
import { AppError } from "../errors/app-error";
import { AuditService } from "./audit-service";
import { ScheduleService } from "./schedule-service";
import { WindowsInstallMonitorService } from "./windows-install-monitor-service";
import { BatchService } from "./batch-service";
import { BotSessionsRepository } from "../storage/bot-sessions-repository";
import { SecurityEventsRepository } from "../storage/events-repository";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";
import { SettingsRepository } from "../storage/settings-repository";
import { SecurityService, type SecurityCheckResult } from "./security-service";
import { AppSettingsService } from "./app-settings-service";
import { getSuperAdminChatId } from "./super-admin-service";
import { sendTelegramAction } from "../telegram/action-sender";
import { NotificationService } from "./notification-service";
import { readTelegramMessageId, recordTelegramAutoDeleteMessage } from "./telegram-message-tracking-service";

export type JobRunnerResult = { checked_jobs: number; executed_jobs: number; failed_jobs: number; result: "success" | "partial_failed" | "failed" | "skipped"; items: Array<{ job_name: string; status: string; summary?: unknown; error_code?: string }> };

const JOB_LOCK_TTL_MS = 4 * 60 * 1000;

export class JobRunnerService {
  constructor(private readonly env: Env) {}

  async runDueJobs(now = new Date()): Promise<JobRunnerResult> {
    if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_job", 500);
    const jobs = await new JobsRepository(this.env.DB).list();
    const enabled = jobs.filter((job) => Number(job.enabled) === 1);
    const due = enabled.filter((job) => isJobDue(job, now));
    const items: JobRunnerResult["items"] = [];
    for (const job of due) items.push(await this.runOne(String(job.name), now));
    const failed_jobs = items.filter((item) => item.status === "failed").length;
    const executed_jobs = items.length;
    const result = executed_jobs === 0 ? "skipped" : failed_jobs === 0 ? "success" : failed_jobs === executed_jobs ? "failed" : "partial_failed";
    return { checked_jobs: enabled.length, executed_jobs, failed_jobs, result, items };
  }

  async cleanupTelegramMessagesNow(now = new Date(), options: { exclude?: Array<{ chatId: string; messageId: number }> } = {}): Promise<{ deleted_telegram_messages: number; failed_telegram_messages: number; auto_delete_minutes: number }> {
    return await this.runTelegramAutoDelete(now, { ignoreDelay: true, exclude: options.exclude ?? [] });
  }

  async notifyDeploymentUpdateIfNeeded(now = new Date()): Promise<{ notification_sent: boolean; reason?: string; version_id?: string }> {
    return await this.runDeploymentUpdateNotification(now);
  }

  private async runOne(jobName: string, now: Date): Promise<JobRunnerResult["items"][number]> {
    if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_job", 500);
    const started = now.toISOString();
    const lockOwner = `${jobName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lockedUntil = new Date(now.getTime() + JOB_LOCK_TTL_MS).toISOString();
    const jobs = new JobsRepository(this.env.DB);
    if (await jobs.tryAcquireLock(jobName, lockOwner, started, lockedUntil) !== "acquired") {
      return { job_name: jobName, status: "skipped", summary: { reason: "job_locked" } };
    }
    try {
      const summary = await this.runJob(jobName, now);
      await this.recordJobRun(jobName, started, "success", summary, null);
      return { job_name: jobName, status: "success", summary };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.JOB_FAILED;
      await this.recordJobRun(jobName, started, "failed", null, code);
      return { job_name: jobName, status: "failed", error_code: code };
    } finally {
      await jobs.releaseLock(jobName, lockOwner);
    }
  }

  private async runJob(jobName: string, now: Date): Promise<unknown> {
    if (jobName === "schedule_power") {
      const deploymentNotification = await this.runDeploymentUpdateNotification(now);
      if (deploymentNotification.notification_sent) return deploymentNotification;
      const result = await new ScheduleService(this.env).runDueSchedules({ requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" }, now);
      const notificationSent = await new NotificationService(this.env).notifyScheduleRunResult(result);
      return { ...result, notification_sent: notificationSent };
    }
    if (jobName === "checkin_monitor") return await this.runCheckinMonitor(now);
    if (jobName === "login_monitor") return await this.runLoginMonitor();
    if (jobName === "windows_install_timeout") return await new WindowsInstallMonitorService(this.env).notifyStaleInstalls(now, 45);
    if (jobName === "message_cleanup") return await this.runMessageCleanup(now);
    if (jobName === "audit_log_cleanup") return await this.runAuditLogCleanup(now);
    if (jobName === "security_event_cleanup") return await this.runSecurityEventCleanup(now);
    if (jobName === "login_timeout") return { checked_events: 0, timed_out: 0 };
    return { skipped: true, reason: "unknown_job" };
  }


  private async runDeploymentUpdateNotification(now: Date): Promise<{ notification_sent: boolean; reason?: string; version_id?: string }> {
    if (!this.env.DB) return { notification_sent: false, reason: "missing_db" };
    const metadata = this.env.CF_VERSION_METADATA;
    const versionId = typeof metadata?.id === "string" && metadata.id.trim().length > 0 ? metadata.id.trim() : "";
    if (!versionId) return { notification_sent: false, reason: "missing_version_metadata" };

    const settings = new SettingsRepository(this.env.DB);
    const lastVersionId = await settings.get<string>("deployment_notify:last_version_id").catch(() => null);
    if (lastVersionId === versionId) return { notification_sent: false, reason: "duplicate", version_id: versionId };

    const notificationSent = await new NotificationService(this.env).notifyDeploymentUpdate({
      version_id: versionId,
      version_tag: typeof metadata?.tag === "string" ? metadata.tag : undefined,
      version_timestamp: typeof metadata?.timestamp === "string" ? metadata.timestamp : undefined,
      detected_at: now.toISOString()
    });
    if (notificationSent) await settings.set("deployment_notify:last_version_id", versionId);
    return { notification_sent: notificationSent, version_id: versionId };
  }

  private async runLoginMonitor(): Promise<SecurityCheckResult & { notifications_sent: number }> {
    const result = await new SecurityService(this.env).checkAccounts({ requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" });
    const newEvents = result.items.flatMap((item) => item.new_events.map((event) => ({ accountAlias: item.account_alias, event })));
    if (newEvents.length === 0) return { ...result, notifications_sent: 0 };
    const chatId = await getSuperAdminChatId(this.env);
    if (!chatId) return { ...result, notifications_sent: 0 };
    const sent = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, {
      method: "sendMessage",
      payload: {
        chat_id: chatId,
        text: renderLoginAlertText(newEvents),
        reply_markup: {
          inline_keyboard: newEvents.slice(0, 5).map(({ event }) => [
            { text: `#${event.id} 是我`, callback_data: `security:confirm:${event.id}` },
            { text: `#${event.id} 不是我`, callback_data: `security:suspicious:${event.id}` }
          ])
        }
      }
    });
    const messageId = readTelegramMessageId(sent);
    if (messageId !== null) await recordTelegramAutoDeleteMessage(this.env, { chatId, messageId, direction: "background_notification", purpose: "login_alert" });
    return { ...result, notifications_sent: 1 };
  }

  private async runCheckinMonitor(now: Date): Promise<{ checked_policies: number; triggered: number }> {
    if (!this.env.DB) return { checked_policies: 0, triggered: 0 };
    const repo = new AdminPresenceRepository(this.env.DB);
    const presence = await repo.getStatus();
    const policies = await repo.listPolicies({ limit: 100, offset: 0 });
    let triggered = 0;
    if (!presence.last_checkin_at || !presence.current_cycle_id) return { checked_policies: policies.length, triggered };
    const minutesSince = Math.floor((now.getTime() - Date.parse(presence.last_checkin_at)) / 60000);
    for (const policy of policies.filter((item) => Number(item.enabled) === 1)) {
      for (const rule of parseRules(policy)) {
        if (minutesSince < rule.after_minutes) continue;
        const run = await repo.tryCreatePolicyRun({ policy_id: policy.id, rule_id: rule.rule_id, cycle_id: presence.current_cycle_id, action: rule.action, status: "running", summary: JSON.stringify({ minutes_since_checkin: minutesSince }) });
        if (!run) continue;
        if (rule.action === "notify") {
          try {
            const rules = parseRules(policy);
            await this.sendPresenceReminder(policy, rule, rules, minutesSince, now);
            await this.auditPolicy(policy, rule, "success", null);
            await repo.updatePolicyRun(run.id, { status: "success", summary: JSON.stringify({ minutes_since_checkin: minutesSince }) });
          } catch (error) {
            const code = error instanceof AppError ? error.code : ErrorCode.JOB_FAILED;
            await this.auditPolicy(policy, rule, "failed", code);
            await repo.updatePolicyRun(run.id, { status: "failed", summary: JSON.stringify({ minutes_since_checkin: minutesSince }), error_code: code });
          }
        } else {
          const batch = await this.runPresenceBatch(policy, rule);
          const notificationSent = await new NotificationService(this.env).notifyPresenceFinalAction({ policy, action: rule.action, minutesSinceCheckin: minutesSince, batch });
          const auditResult = batch.result;
          const errorCode = batch.result === "success" ? null : ErrorCode.JOB_FAILED;
          await this.auditPolicy(policy, rule, auditResult, errorCode);
          await repo.updatePolicyRun(run.id, { status: batch.result, summary: JSON.stringify({ minutes_since_checkin: minutesSince, total: batch.total, success: batch.success, failed: batch.failed, notification_sent: notificationSent }), error_code: batch.result === "success" ? null : ErrorCode.JOB_FAILED });
        }
        triggered += 1;
      }
    }
    return { checked_policies: policies.length, triggered };
  }

  private async runPresenceBatch(policy: AdminPresencePolicyRecord, rule: PresenceRule) {
    const action = rule.action === "shutdown_all_instances" ? "shutdown" : "delete";
    const context = { requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" };
    const service = new BatchService(this.env);
    if (policy.scope.startsWith("account:")) return await service.runAccountBatch(Number(policy.scope.split(":")[1]), action, context);
    if (policy.scope.startsWith("group:")) return await service.runGroupBatch(Number(policy.scope.split(":")[1]), action, context);
    return await service.runAllAccountsBatch(action, context);
  }

  private async auditPolicy(policy: AdminPresencePolicyRecord, rule: PresenceRule, result: string, errorCode: string | null): Promise<void> {
    if (!this.env.DB) return;
    await new AuditService(new AuditRepository(this.env.DB)).record({ request_id: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron", action: `admin_presence.policy.${rule.action === "notify" ? "notify" : rule.action}`, target_type: "admin_presence_policy", target_id: String(policy.id), risk_level: riskForPresence(rule.action), result, error_code: errorCode, metadata_json: JSON.stringify({ rule_id: rule.rule_id }) });
  }

  private async sendPresenceReminder(policy: AdminPresencePolicyRecord, rule: PresenceRule, rules: PresenceRule[], minutesSinceCheckin: number, now: Date): Promise<void> {
    if (!this.env.DB) return;
    const messages = new TelegramMessagesRepository(this.env.DB);
    const latest = await messages.getLatestPendingByPurpose("admin_presence_reminder");
    if (latest && now.getTime() - Date.parse(latest.created_at) < 60 * 60 * 1000) return;
    const chatId = await getSuperAdminChatId(this.env);
    if (!chatId) return;
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, {
      method: "sendMessage",
      payload: {
        chat_id: chatId,
        text: renderPresenceReminderText(policy, rule, rules, minutesSinceCheckin),
        reply_markup: { inline_keyboard: [[{ text: "✅ 我还在，立即打卡", callback_data: "admin_presence:checkin" }], [{ text: "查看保活状态", callback_data: "menu:admin_presence" }]] }
      }
    });
    const messageId = readTelegramMessageId(result);
    if (messageId !== null) {
      await messages.create({ chat_id: chatId, message_id: String(messageId), purpose: "admin_presence_reminder", metadata: { policy_id: policy.id, rule_id: rule.rule_id, minutes_since_checkin: minutesSinceCheckin, remind_after_minutes: rule.after_minutes } });
    }
  }

  private async runMessageCleanup(now: Date): Promise<{ deleted_sessions: number; deleted_telegram_messages: number; failed_telegram_messages: number; auto_delete_minutes: number; purged_telegram_message_records: number }> {
    if (!this.env.DB) return { deleted_sessions: 0, deleted_telegram_messages: 0, failed_telegram_messages: 0, auto_delete_minutes: 0, purged_telegram_message_records: 0 };
    const deleted = await new BotSessionsRepository(this.env.DB).cleanupExpired(now.toISOString());
    const messageCleanup = await this.runTelegramAutoDelete(now);
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const purged = await new TelegramMessagesRepository(this.env.DB).cleanupBefore(cutoff);
    return { deleted_sessions: deleted, ...messageCleanup, purged_telegram_message_records: purged };
  }

  private async runTelegramAutoDelete(now: Date, options: { ignoreDelay?: boolean; exclude?: Array<{ chatId: string; messageId: number }> } = {}): Promise<{ deleted_telegram_messages: number; failed_telegram_messages: number; auto_delete_minutes: number }> {
    if (!this.env.DB) return { deleted_telegram_messages: 0, failed_telegram_messages: 0, auto_delete_minutes: 0 };
    const settings = await new AppSettingsService(this.env).getSettings();
    const minutes = settings.telegram_auto_delete_minutes;
    if (minutes <= 0 && !options.ignoreDelay) return { deleted_telegram_messages: 0, failed_telegram_messages: 0, auto_delete_minutes: 0 };

    const repository = new TelegramMessagesRepository(this.env.DB);
    const messages = await repository.listPendingByPurpose("auto_delete", 100);
    const excluded = new Set((options.exclude ?? []).map((item) => `${item.chatId}:${item.messageId}`));
    let deleted = 0;
    let failed = 0;
    for (const message of messages) {
      if (excluded.has(`${message.chat_id}:${message.message_id}`)) continue;
      const createdAt = Date.parse(message.created_at);
      if (!Number.isFinite(createdAt)) continue;
      if (!options.ignoreDelay && createdAt + minutes * 60 * 1000 > now.getTime()) continue;
      if (now.getTime() - createdAt > 48 * 60 * 60 * 1000) {
        await repository.markDeleteFailed(message.id, ErrorCode.TELEGRAM_API_ERROR);
        failed += 1;
        continue;
      }
      const messageId = Number(message.message_id);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        await repository.markDeleteFailed(message.id, ErrorCode.VALIDATION_ERROR);
        failed += 1;
        continue;
      }
      try {
        await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "deleteMessage", payload: { chat_id: message.chat_id, message_id: messageId } });
        await repository.markDeleted(message.id);
        deleted += 1;
      } catch (error) {
        await repository.markDeleteFailed(message.id, error instanceof AppError ? error.code : ErrorCode.TELEGRAM_API_ERROR);
        failed += 1;
      }
    }
    return { deleted_telegram_messages: deleted, failed_telegram_messages: failed, auto_delete_minutes: minutes };
  }

  private async runAuditLogCleanup(now: Date): Promise<{ deleted_audit_logs: number; retention_days: number }> {
    if (!this.env.DB) return { deleted_audit_logs: 0, retention_days: 0 };
    const retentionDays = normalizeRetentionDays(this.env.OPERATION_LOG_RETENTION_DAYS);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await new AuditRepository(this.env.DB).cleanupBefore(cutoff);
    return { deleted_audit_logs: deleted, retention_days: retentionDays };
  }

  private async runSecurityEventCleanup(now: Date): Promise<{ deleted_security_events: number; deleted_login_events: number; retention_days: number }> {
    if (!this.env.DB) return { deleted_security_events: 0, deleted_login_events: 0, retention_days: 0 };
    const retentionDays = normalizeRetentionDays(this.env.LOGIN_EVENT_RETENTION_DAYS);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const repo = new SecurityEventsRepository(this.env.DB);
    const deleted_security_events = await repo.cleanupSecurityEventsBefore(cutoff);
    const deleted_login_events = await repo.cleanupLoginEventsBefore(cutoff);
    return { deleted_security_events, deleted_login_events, retention_days: retentionDays };
  }

  private async recordJobRun(jobName: string, startedAt: string, status: string, summary: unknown, errorCode: string | null): Promise<void> {
    if (!this.env.DB) return;
    await this.env.DB.prepare(`INSERT INTO job_runs (job_name, started_at, finished_at, status, duration_ms, summary, error_code, error_message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(jobName, startedAt, new Date().toISOString(), status, 0, summary ? JSON.stringify(summary) : null, errorCode, null, null).run();
    await this.env.DB.prepare(`UPDATE jobs SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`).bind(startedAt, new Date(Date.parse(startedAt) + nextRunDelayMs(jobName)).toISOString(), jobName).run();
  }
}

function isJobDue(job: Record<string, unknown>, now: Date): boolean {
  if (typeof job.next_run_at !== "string" || !job.next_run_at) return true;
  const nextRunAt = Date.parse(job.next_run_at);
  return !Number.isFinite(nextRunAt) || nextRunAt <= now.getTime();
}

function nextRunDelayMs(jobName: string): number {
  return jobName === "message_cleanup" ? 60 * 1000 : 5 * 60 * 1000;
}

type PresenceRule = { rule_id: string; after_minutes: number; action: "notify" | "shutdown_all_instances" | "delete_all_instances" };
function parseRules(policy: AdminPresencePolicyRecord): PresenceRule[] {
  try {
    const parsed = JSON.parse(policy.rules_json) as { rules?: PresenceRule[]; action?: PresenceRule["action"] };
    if (Array.isArray(parsed.rules)) return parsed.rules;
    if (parsed.action) return [{ rule_id: parsed.action, after_minutes: 0, action: parsed.action }];
  } catch {}
  return [];
}
function riskForPresence(action: PresenceRule["action"]): "medium" | "high" | "critical" {
  if (action === "delete_all_instances") return "critical";
  if (action === "shutdown_all_instances") return "high";
  return "medium";
}

function normalizeRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function renderLoginAlertText(events: Array<{ accountAlias: string; event: { id: number; type: string; username: string | null; ip: string | null; occurred_at: string } }>): string {
  const lines = ["账号安全登录通知", "", `发现 ${events.length} 个新事件：`, ""];
  for (const { accountAlias, event } of events.slice(0, 10)) {
    lines.push(
      `#${event.id} ${event.type}`,
      `账号：${accountAlias}`,
      `用户：${event.username ?? "-"}`,
      `IP：${event.ip ?? "-"}`,
      `时间：${event.occurred_at}`,
      ""
    );
  }
  if (events.length > 10) lines.push(`另有 ${events.length - 10} 个事件，请打开安全事件列表查看。`);
  return lines.join("\n").trimEnd();
}

function renderPresenceReminderText(policy: AdminPresencePolicyRecord, rule: PresenceRule, rules: PresenceRule[], minutesSinceCheckin: number): string {
  const finalRule = rules.find((item) => item.action !== "notify");
  const remainingMinutes = finalRule ? Math.max(0, finalRule.after_minutes - minutesSinceCheckin) : null;
  const isCountdown = Boolean(finalRule && rule.after_minutes > (rules[0]?.after_minutes ?? 0));
  const stage = isCountdown ? "最终动作倒计时提醒" : "第一段保活提醒";
  const urgency = finalRule?.action === "delete_all_instances" ? "🚨 高危" : finalRule?.action === "shutdown_all_instances" ? "⚠️ 保护" : "⏰ 提醒";
  return [
    `${urgency} 保活打卡提醒`,
    "━━━━━━━━━━━━",
    `📌 策略：#${policy.id} ${policy.name}`,
    `🎯 范围：${formatPresenceScope(policy.scope)}`,
    `📍 阶段：${stage}`,
    "",
    "⏱ 时间状态",
    `• 距离上次打卡：${formatPresenceMinutes(minutesSinceCheckin)}`,
    `• 本次提醒阈值：${formatPresenceMinutes(rule.after_minutes)}`,
    remainingMinutes !== null ? `• 距离最终动作：${remainingMinutes === 0 ? "已到达" : formatPresenceMinutes(remainingMinutes)}` : null,
    "",
    "🛡 最终动作",
    finalRule ? `• ${formatPresenceAction(finalRule.action)}（${formatPresenceMinutes(finalRule.after_minutes)}未打卡）` : "• 只通知，不执行服务器操作",
    "",
    "✅ 如果是本人安全，请直接点击下面按钮打卡。",
    "打卡后会刷新保活周期，并自动清理本轮提醒。"
  ].filter(Boolean).join("\n");
}

function formatPresenceScope(scope: string): string {
  if (scope === "all") return "全部账号";
  if (scope.startsWith("account:")) return `单账号 #${scope.split(":")[1]}`;
  if (scope.startsWith("group:")) return `分组 #${scope.split(":")[1]}`;
  return scope;
}

function formatPresenceAction(action: string): string {
  if (action === "shutdown_all_instances") return "关闭全部服务器";
  if (action === "delete_all_instances") return "删除全部服务器";
  return "只通知";
}

function formatPresenceMinutes(minutes: number): string {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} 天`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小时`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} 小时`;
  return `${minutes} 分钟`;
}
