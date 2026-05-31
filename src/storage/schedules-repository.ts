export type PowerScheduleRecord = {
  id: number;
  name: string;
  enabled: number;
  action: string;
  scope: string;
  account_id: number | null;
  group_id: number | null;
  instance_id: number | null;
  cron_expr: string;
  timezone: string;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata_json: string | null;
};

export type ScheduleUpdateInput = Partial<Pick<PowerScheduleRecord, "name" | "enabled" | "action" | "scope" | "account_id" | "group_id" | "instance_id" | "cron_expr" | "timezone" | "next_run_at" | "metadata_json">>;

export type ScheduleRunRecord = {
  id: number;
  schedule_id: number;
  action: string;
  scope: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  summary: string | null;
  error_code: string | null;
  metadata_json: string | null;
  instance_id?: number | null;
};

export class SchedulesRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: { name: string; enabled: boolean; action: string; scope: string; account_id: number | null; group_id?: number | null; instance_id?: number | null; cron_expr: string; timezone: string; next_run_at: string | null; metadata_json?: string | null }): Promise<PowerScheduleRecord> {
    const result = await this.db.prepare(`INSERT INTO power_schedules (name, enabled, action, scope, account_id, group_id, instance_id, cron_expr, timezone, next_run_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(input.name, input.enabled ? 1 : 0, input.action, input.scope, input.account_id, input.group_id ?? null, input.instance_id ?? null, input.cron_expr, input.timezone, input.next_run_at, input.metadata_json ?? null).run();
    return this.getById(Number(result.meta.last_row_id));
  }

  async getById(id: number): Promise<PowerScheduleRecord> {
    const row = await this.db.prepare(`SELECT id, name, enabled, action, scope, account_id, group_id, instance_id, cron_expr, timezone, last_run_at, next_run_at, created_at, updated_at, deleted_at, metadata_json
      FROM power_schedules WHERE id = ? AND deleted_at IS NULL`).bind(id).first<PowerScheduleRecord>();
    if (!row) {
      const fallback = (await this.list({ limit: 100, offset: 0 })).find((item) => item.id === id);
      if (fallback) return fallback;
      throw new Error("SCHEDULE_NOT_FOUND");
    }
    return row;
  }

  async list(params: { limit?: number; offset?: number } = {}): Promise<PowerScheduleRecord[]> {
    const limit = clampLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const result = await this.db.prepare(`SELECT id, name, enabled, action, scope, account_id, group_id, instance_id, cron_expr, timezone, last_run_at, next_run_at, created_at, updated_at, deleted_at, metadata_json
      FROM power_schedules WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?`).bind(limit, offset).all<PowerScheduleRecord>();
    return result.results ?? [];
  }

  async listDue(nowIso: string): Promise<PowerScheduleRecord[]> {
    const rows = await this.list({ limit: 100, offset: 0 });
    return rows.filter((row) => Number(row.enabled) === 1 && row.next_run_at !== null && row.next_run_at <= nowIso);
  }


  async update(id: number, input: ScheduleUpdateInput): Promise<PowerScheduleRecord> {
    const current = await this.getById(id);
    await this.db.prepare(`UPDATE power_schedules
      SET name = ?, enabled = ?, action = ?, scope = ?, account_id = ?, group_id = ?, instance_id = ?, cron_expr = ?, timezone = ?, next_run_at = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL`).bind(
        input.name ?? current.name,
        input.enabled ?? current.enabled,
        input.action ?? current.action,
        input.scope ?? current.scope,
        input.account_id === undefined ? current.account_id : input.account_id,
        input.group_id === undefined ? current.group_id : input.group_id,
        input.instance_id === undefined ? current.instance_id : input.instance_id,
        input.cron_expr ?? current.cron_expr,
        input.timezone ?? current.timezone,
        input.next_run_at === undefined ? current.next_run_at : input.next_run_at,
        input.metadata_json === undefined ? current.metadata_json : input.metadata_json,
        id
      ).run();
    return this.getById(id);
  }

  async enable(id: number): Promise<PowerScheduleRecord> {
    await this.db.prepare(`UPDATE power_schedules SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return this.getById(id);
  }

  async disable(id: number): Promise<PowerScheduleRecord> {
    await this.db.prepare(`UPDATE power_schedules SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return this.getById(id);
  }

  async enableAll(): Promise<{ affected: number; schedules: PowerScheduleRecord[] }> {
    const schedules = await this.list({ limit: 100, offset: 0 });
    const targets = schedules.filter((schedule) => Number(schedule.enabled) !== 1);
    await this.db.prepare(`UPDATE power_schedules SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND enabled != 1`).run();
    return { affected: targets.length, schedules: targets.map((schedule) => ({ ...schedule, enabled: 1 })) };
  }

  async disableAll(): Promise<{ affected: number; schedules: PowerScheduleRecord[] }> {
    const schedules = await this.list({ limit: 100, offset: 0 });
    const targets = schedules.filter((schedule) => Number(schedule.enabled) === 1);
    await this.db.prepare(`UPDATE power_schedules SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND enabled = 1`).run();
    return { affected: targets.length, schedules: targets.map((schedule) => ({ ...schedule, enabled: 0 })) };
  }

  async delete(id: number): Promise<PowerScheduleRecord> {
    const before = await this.getById(id);
    await this.db.prepare(`UPDATE power_schedules SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return before;
  }

  async claimDueRun(id: number, expectedNextRunAt: string, nextRunAt: string | null, startedAt: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE power_schedules
      SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL AND enabled = 1 AND next_run_at = ?`).bind(startedAt, nextRunAt, id, expectedNextRunAt).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async markRun(id: number, lastRunAt: string, nextRunAt: string | null): Promise<void> {
    await this.db.prepare(`UPDATE power_schedules SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(lastRunAt, nextRunAt, id).run();
  }

  async createRun(input: { schedule_id: number; action: string; scope: string; instance_id?: number | null; started_at: string; finished_at?: string | null; status: string; summary?: string | null; error_code?: string | null; metadata_json?: string | null }): Promise<void> {
    await this.db.prepare(`INSERT INTO schedule_runs (schedule_id, action, scope, instance_id, started_at, finished_at, status, summary, error_code, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(input.schedule_id, input.action, input.scope, input.instance_id ?? null, input.started_at, input.finished_at ?? null, input.status, input.summary ?? null, input.error_code ?? null, input.metadata_json ?? null).run();
  }
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
