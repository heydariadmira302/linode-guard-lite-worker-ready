import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { JobRunnerService } from "../services/job-runner-service";
import { getSuperAdminChatId } from "../services/super-admin-service";
import { SettingsRepository } from "../storage/settings-repository";
import { createJsonResponse } from "../utils/json-response";

export async function handleDeploymentNotificationStatus(_request: Request, env: Env, requestId: string): Promise<Response> {
  const data = await getDeploymentNotificationStatus(env);
  return createJsonResponse({ ok: true, data }, { requestId });
}

export async function handleDeploymentNotificationTrigger(_request: Request, env: Env, requestId: string): Promise<Response> {
  const before = await getDeploymentNotificationStatus(env);
  const trigger = await new JobRunnerService(env).notifyDeploymentUpdateIfNeeded(new Date());
  const after = await getDeploymentNotificationStatus(env);
  return createJsonResponse({ ok: true, data: { before, trigger, after } }, { requestId });
}

async function getDeploymentNotificationStatus(env: Env): Promise<Record<string, unknown>> {
  const metadata = env.CF_VERSION_METADATA;
  const versionId = typeof metadata?.id === "string" && metadata.id.trim() ? metadata.id.trim() : null;
  const chatId = await getSuperAdminChatId(env).catch(() => null);
  let lastVersionId: string | null = null;
  if (env.DB) lastVersionId = await new SettingsRepository(env.DB).get<string>("deployment_notify:last_version_id").catch(() => null);
  return {
    db_bound: Boolean(env.DB),
    telegram_bot_token_configured: typeof env.TELEGRAM_BOT_TOKEN === "string" && env.TELEGRAM_BOT_TOKEN.trim().length > 0,
    super_admin_chat_configured: Boolean(chatId),
    worker_version_metadata_configured: Boolean(versionId),
    current_version_id: versionId,
    current_version_tag: typeof metadata?.tag === "string" ? metadata.tag : null,
    current_version_timestamp: typeof metadata?.timestamp === "string" ? metadata.timestamp : null,
    last_notified_version_id: lastVersionId,
    notification_due: Boolean(versionId && lastVersionId !== versionId)
  };
}
