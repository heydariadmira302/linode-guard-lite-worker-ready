import type { Env } from "../env";
import { ErrorCode } from "../errors/error-codes";
import { listMissingTables } from "../storage/db";
import { JobsRepository } from "../storage/jobs-repository";
import { SCHEMA_SQL } from "../storage/schema";
import { SettingsRepository } from "../storage/settings-repository";
import { ensureRuntimeSecrets, getRuntimeSecrets, type RuntimeSecrets } from "./runtime-secret-service";

export const DEFAULT_JOBS = [
  "login_monitor",
  "login_timeout",
  "checkin_monitor",
  "schedule_power",
  "message_cleanup",
  "audit_log_cleanup",
  "security_event_cleanup"
] as const;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  security_settings: {
    enabled: true,
    ip_allowlist: [],
    allowed_countries: [],
    blocked_countries: [],
    failed_login_threshold: 3,
    failed_login_window_minutes: 30,
    night_login_enabled: true,
    night_start: "00:00",
    night_end: "06:00",
    timezone: "Asia/Shanghai",
    login_confirmation_timeout_minutes: 30
  },
  app_settings: {
    timezone: "Asia/Shanghai",
    batch_concurrency: 5,
    operation_log_retention_days: 1,
    login_event_retention_days: 1
  }
};

type CheckResult = {
  ok: boolean;
  error_code?: ErrorCode;
  message?: string;
  missing?: string[];
};

export type DeploymentDiagnostics = {
  status: "ok" | "failed";
  checks: Record<string, CheckResult>;
};

export type JobDiagnostic = {
  name: string;
  exists: boolean;
  enabled: boolean;
  type: string | null;
  last_run_at: unknown;
  last_status: unknown;
  summary: unknown;
};

export type JobsDiagnostics = {
  status: "ok" | "failed";
  missing: string[];
  disabled: string[];
  jobs: JobDiagnostic[];
};

export type InitializeSchemaResult = {
  schema: { initialized: boolean; missing_before: string[]; missing_after: string[] };
};

export type InitializeSetupResult = {
  schema?: { initialized: boolean; missing_before: string[]; missing_after: string[] };
  settings: { created: string[]; existing: string[] };
  runtime_secrets: { created: string[]; existing: string[]; manual?: string[]; values?: RuntimeSecrets };
  telegram_webhook?: { attempted: boolean; ok: boolean; webhook_url?: string; error?: string };
  jobs: { created: string[]; existing: string[] };
  admin_presence: { initialized: boolean };
};

export type InitializeSetupOptions = {
  manualSecrets?: Partial<RuntimeSecrets>;
  configureTelegramWebhook?: boolean;
  webhookUrl?: string;
};

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function envCheck(ok: boolean, message: string): CheckResult {
  return ok ? { ok: true } : { ok: false, error_code: ErrorCode.CONFIG_MISSING, message };
}

async function executeSchema(db: D1Database): Promise<void> {
  const statements = SCHEMA_SQL.split(";").map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();
}

export class DiagnosticsService {
  constructor(private readonly env: Env) {}

  async getDeploymentDiagnostics(): Promise<DeploymentDiagnostics> {
    const runtimeSecrets: Partial<RuntimeSecrets> = await getRuntimeSecrets(this.env).catch(() => ({}));
    const checks: DeploymentDiagnostics["checks"] = {
      telegram_bot_token: envCheck(hasValue(this.env.TELEGRAM_BOT_TOKEN), "Missing TELEGRAM_BOT_TOKEN"),
      telegram_webhook_secret: envCheck(hasValue(runtimeSecrets.telegram_webhook_secret), "Missing TELEGRAM_WEBHOOK_SECRET; run /setup initialize to auto-generate"),
      super_admin_telegram_id: envCheck(true, "Super Admin can be bootstrapped from first Telegram message"),
      api_auth_token: envCheck(hasValue(runtimeSecrets.api_auth_token), "Missing API_AUTH_TOKEN; run /setup initialize to auto-generate"),
      linode_token_encryption_key: envCheck(hasValue(runtimeSecrets.linode_token_encryption_key), "Missing LINODE_TOKEN_ENCRYPTION_KEY; run /setup initialize to auto-generate"),
      db: this.env.DB ? { ok: true } : { ok: false, error_code: ErrorCode.CONFIG_MISSING, message: "Missing D1 binding DB" },
      tables: { ok: false, missing: [] }
    };

    if (!this.env.DB) {
      checks.tables = { ok: false, error_code: ErrorCode.CONFIG_MISSING, message: "Cannot inspect tables without D1 binding DB", missing: [] };
    } else {
      try {
        const missing = await listMissingTables(this.env.DB);
        checks.tables = { ok: missing.length === 0, missing };
      } catch {
        checks.tables = { ok: false, error_code: ErrorCode.D1_ERROR, message: "Failed to inspect D1 table structure", missing: [] };
      }
    }

    return { status: Object.values(checks).every((check) => check.ok) ? "ok" : "failed", checks };
  }

  async getJobsDiagnostics(): Promise<JobsDiagnostics> {
    if (!this.env.DB) {
      return { status: "failed", missing: [...DEFAULT_JOBS], disabled: [], jobs: DEFAULT_JOBS.map((name) => ({ name, exists: false, enabled: false, type: null, last_run_at: null, last_status: null, summary: null })) };
    }

    const rows = await new JobsRepository(this.env.DB).list();
    const byName = new Map(rows.map((job) => [String(job.name), job]));
    const jobs = DEFAULT_JOBS.map((name) => {
      const row = byName.get(name);
      const exists = Boolean(row);
      const enabled = row ? Boolean(Number(row.enabled)) : false;
      return {
        name,
        exists,
        enabled,
        type: row ? String(row.type) : null,
        last_run_at: row?.last_run_at ?? null,
        last_status: row?.last_status ?? null,
        summary: row?.summary ?? null
      };
    });
    const missing = jobs.filter((job) => !job.exists).map((job) => job.name);
    const disabled = jobs.filter((job) => job.exists && !job.enabled).map((job) => job.name);
    return { status: missing.length === 0 && disabled.length === 0 ? "ok" : "failed", missing, disabled, jobs };
  }
}

export class SetupService {
  constructor(private readonly env: Env) {}

  async initializeSchema(): Promise<InitializeSchemaResult> {
    if (!this.env.DB) {
      throw new Error("Missing D1 binding DB");
    }

    const missingBefore = await listMissingTables(this.env.DB);
    await executeSchema(this.env.DB);
    const missingAfter = await listMissingTables(this.env.DB);
    return { schema: { initialized: missingAfter.length === 0, missing_before: missingBefore, missing_after: missingAfter } };
  }

  async initializeDefaults(options: InitializeSetupOptions = {}): Promise<InitializeSetupResult> {
    if (!this.env.DB) {
      throw new Error("Missing D1 binding DB");
    }

    const missing = await listMissingTables(this.env.DB);
    const schema = missing.length > 0 ? await this.initializeSchema() : { schema: { initialized: true, missing_before: [], missing_after: [] } };

    const settingsRepository = new SettingsRepository(this.env.DB);
    const jobsRepository = new JobsRepository(this.env.DB);
    const result: InitializeSetupResult = {
      schema: schema.schema,
      settings: { created: [], existing: [] },
      runtime_secrets: { created: [], existing: [] },
      jobs: { created: [], existing: [] },
      admin_presence: { initialized: false }
    };

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await settingsRepository.get(key);
      if (existing === null) {
        await settingsRepository.createIfMissing(key, defaultValue);
        result.settings.created.push(key);
      } else {
        result.settings.existing.push(key);
      }
    }

    const runtimeSecrets = await ensureRuntimeSecrets(this.env, options.manualSecrets ?? {});
    result.runtime_secrets.created = runtimeSecrets.created;
    result.runtime_secrets.existing = runtimeSecrets.existing;
    result.runtime_secrets.manual = runtimeSecrets.manual;
    result.runtime_secrets.values = runtimeSecrets.secrets;

    if (options.configureTelegramWebhook && options.webhookUrl) {
      result.telegram_webhook = await configureTelegramWebhook(this.env.TELEGRAM_BOT_TOKEN, options.webhookUrl, runtimeSecrets.secrets.telegram_webhook_secret);
    }

    for (const name of DEFAULT_JOBS) {
      const existed = (await jobsRepository.getByName(name)) !== null;
      await jobsRepository.createDefaultJob(name, "system", true);
      if (existed) result.jobs.existing.push(name);
      else result.jobs.created.push(name);
    }

    await this.env.DB.prepare("INSERT INTO admin_presence (id) VALUES (1) ON CONFLICT(id) DO NOTHING").run();
    result.admin_presence.initialized = true;
    return result;
  }
}

async function configureTelegramWebhook(botToken: string, webhookUrl: string, secretToken: string): Promise<{ attempted: boolean; ok: boolean; webhook_url?: string; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: secretToken })
    });
    const text = await response.text();
    let data: { ok?: boolean; description?: string } = {};
    try { data = JSON.parse(text) as { ok?: boolean; description?: string }; } catch {}
    return response.ok && data.ok === true
      ? { attempted: true, ok: true, webhook_url: webhookUrl }
      : { attempted: true, ok: false, webhook_url: webhookUrl, error: data.description ?? text ?? `HTTP ${response.status}` };
  } catch (error) {
    return { attempted: true, ok: false, webhook_url: webhookUrl, error: error instanceof Error ? error.message : String(error) };
  }
}
