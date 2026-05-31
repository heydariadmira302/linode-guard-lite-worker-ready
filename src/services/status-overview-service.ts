import type { Env } from "../env";
import { AuditRepository, type AuditLogRecord } from "../storage/audit-repository";
import { SchedulesRepository, type PowerScheduleRecord } from "../storage/schedules-repository";
import { AdminPresenceService, type AdminPresenceStatusResult, type PublicAdminPresencePolicy } from "./admin-presence-service";
import { InstanceService } from "./instance-service";
import { SecurityService, type SecurityOverviewResult } from "./security-service";

export type StatusOverviewResult = {
  instances: {
    total: number;
    running: number;
    offline: number;
    other: number;
    failed_accounts: number;
  };
  schedules: {
    total: number;
    enabled: number;
    recent_schedules: PowerScheduleRecord[];
  };
  admin_presence: (AdminPresenceStatusResult & { policies: PublicAdminPresencePolicy[] }) | null;
  security: SecurityOverviewResult;
  recent_high_risk_audit: AuditLogRecord | null;
  generated_at: string;
};

export class StatusOverviewService {
  constructor(private readonly env: Env) {}

  async getOverview(requestId: string): Promise<StatusOverviewResult> {
    const [instanceData, schedules, adminPresence, security, recentHighRiskAudit] = await Promise.all([
      new InstanceService(this.env).listAllActiveAccountInstances(requestId).catch(() => ({ accounts: [] })),
      this.env.DB ? new SchedulesRepository(this.env.DB).list({ limit: 100, offset: 0 }).catch(() => []) : Promise.resolve([]),
      this.env.DB ? getAdminPresenceOverview(this.env).catch(() => null) : Promise.resolve(null),
      this.env.DB ? new SecurityService(this.env).getOverview().catch(() => ({ open_events: 0, recent_events: [] })) : Promise.resolve({ open_events: 0, recent_events: [] }),
      this.env.DB ? getRecentHighRiskAudit(this.env.DB).catch(() => null) : Promise.resolve(null)
    ]);

    const instances = instanceData.accounts.flatMap((account) => account.instances);
    const running = instances.filter((instance) => instance.status === "running").length;
    const offline = instances.filter((instance) => ["offline", "powered_off"].includes(instance.status)).length;
    const failedAccounts = instanceData.accounts.filter((account) => account.instances.length === 0 && account.account.token_status !== "valid").length;

    return {
      instances: {
        total: instances.length,
        running,
        offline,
        other: Math.max(0, instances.length - running - offline),
        failed_accounts: failedAccounts
      },
      schedules: summarizeSchedules(schedules),
      admin_presence: adminPresence,
      security,
      recent_high_risk_audit: recentHighRiskAudit,
      generated_at: new Date().toISOString()
    };
  }
}

async function getAdminPresenceOverview(env: Env): Promise<(AdminPresenceStatusResult & { policies: PublicAdminPresencePolicy[] }) | null> {
  const service = new AdminPresenceService(env);
  const [status, list] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 5, offset: 0 })]);
  return { ...status, policies: list.policies };
}

async function getRecentHighRiskAudit(db: D1Database): Promise<AuditLogRecord | null> {
  const repository = new AuditRepository(db);
  const [critical, high] = await Promise.all([
    repository.list({ limit: 1, offset: 0, risk_level: "critical" }),
    repository.list({ limit: 1, offset: 0, risk_level: "high" })
  ]);
  return [...critical, ...high].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
}

function summarizeSchedules(schedules: PowerScheduleRecord[]): StatusOverviewResult["schedules"] {
  const enabled = schedules.filter((schedule) => Number(schedule.enabled) === 1);
  return {
    total: schedules.length,
    enabled: enabled.length,
    recent_schedules: schedules.slice(0, 5)
  };
}
