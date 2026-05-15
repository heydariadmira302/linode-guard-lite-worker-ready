import type { Env } from "../env";
import { AdminPresenceRepository, type AdminPresencePolicyRecord } from "../storage/admin-presence-repository";
import { JobsRepository } from "../storage/jobs-repository";
import { AuditRepository } from "../storage/audit-repository";
import { ErrorCode } from "../errors/error-codes";
import { AppError } from "../errors/app-error";
import { AuditService } from "./audit-service";
import { ScheduleService } from "./schedule-service";
import { BatchService } from "./batch-service";
import { BotSessionsRepository } from "../storage/bot-sessions-repository";
import { SecurityEventsRepository } from "../storage/events-repository";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";
import { SecurityService, type SecurityCheckResult } from "./security-service";
import { getSuperAdminChatId } from "./super-admin-service";
import { sendTelegramAction } from "../telegram/action-sender";
import type { TelegramClientAction } from "../telegram/types";

export type JobRunnerResult = { checked_jobs: number; executed_jobs: number; failed_jobs: number; result: "success" | "partial_failed" | "failed" | "skipped"; items: Array<{ job_name: string; status: string; summary?: unknown; error_code?: string }> };

export class JobRunnerService {
  constructor(private readonly env: Env) {}

  async runDueJobs(now = new Date()): Promise<JobRunnerResult> {
    if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_job", 500);
    const jobs = await new JobsRepository(this.env.DB).list();
    const enabled = jobs.filter((job) => Number(job.enabled) === 1);
    const items: JobRunnerResult["items"] = [];
    for (const job of enabled) items.push(await this.runOne(String(job.name), now));
    const failed_jobs = items.filter((item) => item.status === "failed").length;
    const executed_jobs = items.length;
    const result = executed_jobs === 0 ? "skipped" : failed_jobs === 0 ? "success" : failed_jobs === executed_jobs ? "failed" : "partial_failed";
    return { checked_jobs: enabled.length, executed_jobs, failed_jobs, result, items };
  }

  private async runOne(jobName: string, now: Date): Promise<JobRunnerResult["items"][number]> {
    const started = now.toISOString();
    try {
      const summary = await this.runJob(jobName, now);
      await this.recordJobRun(jobName, started, "success", summary, null);
      return { job_name: jobName, status: "success", summary };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.JOB_FAILED;
      await this.recordJobRun(jobName, started, "failed", null, code);
      return { job_name: jobName, status: "failed", error_code: code };
    }
  }

  private async runJob(jobName: string, now: Date): Promise<unknown> {
    if (jobName === "schedule_power") return await new ScheduleService(this.env).runDueSchedules({ requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" }, now);
    if (jobName === "checkin_monitor") return await this.runCheckinMonitor(now);
    if (jobName === "login_monitor") return await this.runLoginMonitor();
    if (jobName === "message_cleanup") return await this.runMessageCleanup(now);
    if (jobName === "audit_log_cleanup") return await this.runAuditLogCleanup(now);
    if (jobName === "security_event_cleanup") return await this.runSecurityEventCleanup(now);
    if (jobName === "login_timeout") return { checked_events: 0, timed_out: 0 };
    return { skipped: true, reason: "unknown_job" };
  }

  private async runLoginMonitor(): Promise<SecurityCheckResult & { notifications_sent: number }> {
    const result = await new SecurityService(this.env).checkAccounts({ requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" });
    const newEvents = result.items.flatMap((item) => item.new_events.map((event) => ({ accountAlias: item.account_alias, event })));
    if (newEvents.length === 0) return { ...result, notifications_sent: 0 };
    const chatId = await getSuperAdminChatId(this.env);
    if (!chatId) return { ...result, notifications_sent: 0 };
    await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, {
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
        const existingRun = await repo.getPolicyRun(policy.id, rule.rule_id, presence.current_cycle_id);
        if (existingRun) continue;
        if (rule.action === "notify") {
          await this.sendPresenceReminder(policy, rule, minutesSince, now);
          await this.auditPolicy(policy, rule, "success", null);
        } else {
          const batch = rule.action === "shutdown_all_instances"
            ? await new BatchService(this.env).runAllAccountsBatch("shutdown", { requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" })
            : await new BatchService(this.env).runAllAccountsBatch("delete", { requestId: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron" });
          const auditResult = batch.result;
          const errorCode = batch.result === "success" ? null : ErrorCode.JOB_FAILED;
          await this.auditPolicy(policy, rule, auditResult, errorCode);
          await repo.createPolicyRun({ policy_id: policy.id, rule_id: rule.rule_id, cycle_id: presence.current_cycle_id, action: rule.action, status: batch.result, summary: JSON.stringify({ minutes_since_checkin: minutesSince, total: batch.total, success: batch.success, failed: batch.failed }), error_code: batch.result === "success" ? null : ErrorCode.JOB_FAILED });
        }
        triggered += 1;
      }
    }
    return { checked_policies: policies.length, triggered };
  }

  private async auditPolicy(policy: AdminPresencePolicyRecord, rule: PresenceRule, result: string, errorCode: string | null): Promise<void> {
    if (!this.env.DB) return;
    await new AuditService(new AuditRepository(this.env.DB)).record({ request_id: `cron_${Date.now()}`, actor: "cron:job_runner", source: "cron", action: `admin_presence.policy.${rule.action === "notify" ? "notify" : rule.action}`, target_type: "admin_presence_policy", target_id: String(policy.id), risk_level: riskForPresence(rule.action), result, error_code: errorCode, metadata_json: JSON.stringify({ rule_id: rule.rule_id }) });
  }

  private async sendPresenceReminder(policy: AdminPresencePolicyRecord, rule: PresenceRule, minutesSinceCheckin: number, now: Date): Promise<void> {
    if (!this.env.DB) return;
    if (minutesSinceCheckin < 12 * 60) return;
    const messages = new TelegramMessagesRepository(this.env.DB);
    const latest = await messages.getLatestPendingByPurpose("admin_presence_reminder");
    if (latest && now.getTime() - Date.parse(latest.created_at) < 60 * 60 * 1000) return;
    const chatId = await getSuperAdminChatId(this.env);
    if (!chatId) return;
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, {
      method: "sendMessage",
      payload: {
        chat_id: chatId,
        text: renderPresenceReminderText(minutesSinceCheckin),
        reply_markup: { inline_keyboard: [[{ text: "我还在，立即确认", callback_data: "admin_presence:checkin" }], [{ text: "查看保活状态", callback_data: "menu:admin_presence" }]] }
      }
    });
    const messageId = readTelegramMessageId(result);
    if (messageId !== null) await messages.create({ chat_id: chatId, message_id: String(messageId), purpose: "admin_presence_reminder", metadata: { policy_id: policy.id, rule_id: rule.rule_id, minutes_since_checkin: minutesSinceCheckin } });
  }

  private async runMessageCleanup(now: Date): Promise<{ deleted_sessions: number }> {
    if (!this.env.DB) return { deleted_sessions: 0 };
    const deleted = await new BotSessionsRepository(this.env.DB).cleanupExpired(now.toISOString());
    return { deleted_sessions: deleted };
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
    await this.env.DB.prepare(`UPDATE jobs SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`).bind(startedAt, new Date(Date.parse(startedAt) + 5 * 60 * 1000).toISOString(), jobName).run();
  }
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

function renderPresenceReminderText(minutesSinceCheckin: number): string {
  const hours = Math.floor(minutesSinceCheckin / 60);
  return [
    "保活确认提醒",
    "",
    `距离上次确认已经约 ${hours} 小时。`,
    "请点击按钮确认你仍在管理这套 Linode 资源。",
    "确认后，之前发出的保活提醒会自动删除。"
  ].join("\n");
}

function readTelegramMessageId(result: unknown): number | null {
  const value = result as { result?: { message_id?: unknown } };
  return typeof value.result?.message_id === "number" ? value.result.message_id : null;
}

