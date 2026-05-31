export type BotManagedPowerState = {
  account_id: number;
  instance_id: number;
  label: string | null;
  last_action: string;
  last_action_at: string;
  last_actor: string | null;
  last_source: string | null;
  last_request_id: string | null;
  metadata_json: string | null;
};

export type BotManagedPowerStateInput = {
  account_id: number;
  instance_id: number;
  label?: string | null;
  last_action: "shutdown" | "boot" | "delete";
  actor?: string | null;
  source?: string | null;
  request_id?: string | null;
  metadata_json?: string | null;
};

export class BotManagedInstancesRepository {
  constructor(private readonly db: D1Database) {}

  async markAction(input: BotManagedPowerStateInput): Promise<void> {
    await this.db.prepare(`INSERT INTO bot_managed_instances (account_id, instance_id, label, last_action, last_action_at, last_actor, last_source, last_request_id, metadata_json)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
      ON CONFLICT(account_id, instance_id) DO UPDATE SET
        label = excluded.label,
        last_action = excluded.last_action,
        last_action_at = CURRENT_TIMESTAMP,
        last_actor = excluded.last_actor,
        last_source = excluded.last_source,
        last_request_id = excluded.last_request_id,
        metadata_json = excluded.metadata_json`)
      .bind(input.account_id, input.instance_id, input.label ?? null, input.last_action, input.actor ?? null, input.source ?? null, input.request_id ?? null, input.metadata_json ?? null)
      .run();
  }

  async isBotManagedOffline(accountId: number, instanceId: number): Promise<boolean> {
    const row = await this.db.prepare(`SELECT last_action FROM bot_managed_instances WHERE account_id = ? AND instance_id = ? LIMIT 1`)
      .bind(accountId, instanceId)
      .first<{ last_action: string }>();
    return row?.last_action === "shutdown";
  }

  async listBotManagedOffline(accountId?: number): Promise<BotManagedPowerState[]> {
    const sql = `SELECT account_id, instance_id, label, last_action, last_action_at, last_actor, last_source, last_request_id, metadata_json
      FROM bot_managed_instances
      WHERE last_action = 'shutdown' ${accountId ? "AND account_id = ?" : ""}
      ORDER BY last_action_at DESC`;
    const statement = this.db.prepare(sql);
    const result = accountId ? await statement.bind(accountId).all<BotManagedPowerState>() : await statement.all<BotManagedPowerState>();
    return result.results ?? [];
  }
}
