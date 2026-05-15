export type AdminPresenceRecord = {
  id: number;
  last_checkin_at: string | null;
  last_checkin_actor: string | null;
  current_cycle_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPresencePolicyRecord = {
  id: number;
  name: string;
  enabled: number;
  scope: string;
  rules_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AdminPresencePolicyInput = {
  name: string;
  enabled: boolean;
  scope: "all";
  rules_json: string;
};

export type AdminPresencePolicyListParams = {
  limit?: number;
  offset?: number;
};

export type AdminPresencePolicyRunInput = { policy_id: number; rule_id: string; cycle_id: string; action: string; status: string; summary?: string | null; error_code?: string | null; metadata_json?: string | null };
export type AdminPresencePolicyRunRecord = AdminPresencePolicyRunInput & { id: number; triggered_at: string };

export class AdminPresenceRepository {
  constructor(private readonly db: D1Database) {}

  async initialize(): Promise<void> {
    await this.db.prepare(`INSERT OR IGNORE INTO admin_presence (id) VALUES (1)`).run();
  }

  async getStatus(): Promise<AdminPresenceRecord> {
    await this.initialize();
    const row = await this.db.prepare(`SELECT id, last_checkin_at, last_checkin_actor, current_cycle_id, created_at, updated_at
      FROM admin_presence
      WHERE id = 1`).first<AdminPresenceRecord>();
    return row ?? { id: 1, last_checkin_at: null, last_checkin_actor: null, current_cycle_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }

  async updateCheckin(input: { last_checkin_at: string; last_checkin_actor: string; current_cycle_id: string }): Promise<AdminPresenceRecord> {
    await this.initialize();
    await this.db.prepare(`UPDATE admin_presence
      SET last_checkin_at = ?, last_checkin_actor = ?, current_cycle_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`)
      .bind(input.last_checkin_at, input.last_checkin_actor, input.current_cycle_id)
      .run();
    return this.getStatus();
  }

  async createPolicy(input: AdminPresencePolicyInput): Promise<AdminPresencePolicyRecord> {
    const result = await this.db.prepare(`INSERT INTO admin_presence_policies (name, enabled, scope, rules_json)
      VALUES (?, ?, ?, ?)`)
      .bind(input.name, input.enabled ? 1 : 0, input.scope, input.rules_json)
      .run();
    return await this.getPolicy(Number(result.meta.last_row_id));
  }

  async getPolicy(id: number): Promise<AdminPresencePolicyRecord> {
    const row = await this.db.prepare(`SELECT id, name, enabled, scope, rules_json, created_at, updated_at, deleted_at
      FROM admin_presence_policies
      WHERE id = ? AND deleted_at IS NULL`)
      .bind(id)
      .first<AdminPresencePolicyRecord>();
    if (!row) {
      const rows = await this.listPolicies({ limit: 100, offset: 0 });
      const fallback = rows.find((policy) => policy.id === id);
      if (fallback) return fallback;
      throw new Error("POLICY_NOT_FOUND");
    }
    return row;
  }

  async listPolicies(params: AdminPresencePolicyListParams = {}): Promise<AdminPresencePolicyRecord[]> {
    const limit = clampLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const result = await this.db.prepare(`SELECT id, name, enabled, scope, rules_json, created_at, updated_at, deleted_at
      FROM admin_presence_policies
      WHERE deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all<AdminPresencePolicyRecord>();
    return result.results ?? [];
  }

  async countEnabledPolicies(): Promise<number> {
    const result = await this.db.prepare(`SELECT id, name, enabled, scope, rules_json, created_at, updated_at, deleted_at
      FROM admin_presence_policies
      WHERE deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ? OFFSET ?`)
      .bind(100, 0)
      .all<AdminPresencePolicyRecord>();
    return (result.results ?? []).filter((policy) => Number(policy.enabled) === 1).length;
  }

  async enablePolicy(id: number): Promise<AdminPresencePolicyRecord> {
    await this.db.prepare(`UPDATE admin_presence_policies SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return this.getPolicy(id);
  }

  async disablePolicy(id: number): Promise<AdminPresencePolicyRecord> {
    await this.db.prepare(`UPDATE admin_presence_policies SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return this.getPolicy(id);
  }

  async deletePolicy(id: number): Promise<AdminPresencePolicyRecord> {
    const before = await this.getPolicy(id);
    await this.db.prepare(`UPDATE admin_presence_policies SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    return before;
  }

  async getPolicyRun(policyId: number, ruleId: string, cycleId: string): Promise<AdminPresencePolicyRunRecord | null> {
    return await this.db.prepare(`SELECT id, policy_id, rule_id, cycle_id, action, status, triggered_at, summary, error_code, metadata_json
      FROM admin_presence_policy_runs
      WHERE policy_id = ? AND rule_id = ? AND cycle_id = ?
      LIMIT 1`).bind(policyId, ruleId, cycleId).first<AdminPresencePolicyRunRecord>();
  }

  async createPolicyRun(input: AdminPresencePolicyRunInput): Promise<void> {
    await this.db.prepare(`INSERT INTO admin_presence_policy_runs (policy_id, rule_id, cycle_id, action, status, summary, error_code, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(input.policy_id, input.rule_id, input.cycle_id, input.action, input.status, input.summary ?? null, input.error_code ?? null, input.metadata_json ?? null).run();
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
