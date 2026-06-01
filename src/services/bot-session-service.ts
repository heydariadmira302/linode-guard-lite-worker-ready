import { BotSessionsRepository } from "../storage/bot-sessions-repository";

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;
const LONG_FLOW_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const LONG_FLOW_STATES = new Set([
  "creating_instance",
  "creating_windows_instance",
  "creating_windows_password",
  "creating_windows_label",
  "creating_schedule_custom_time",
  "confirming_batch_delete"
]);

export class BotSessionService {
  constructor(private readonly repository: BotSessionsRepository) {}

  async setCurrentSession(input: { telegramUserId: string; chatId: string; state: string; data?: unknown }): Promise<void> {
    const ttlMs = LONG_FLOW_STATES.has(input.state) ? LONG_FLOW_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await this.repository.upsert({
      telegram_user_id: input.telegramUserId,
      chat_id: input.chatId,
      state: input.state,
      data: input.data,
      expires_at: expiresAt
    });
  }

  async getCurrentSession(telegramUserId: string) {
    return await this.repository.getByUserId(telegramUserId);
  }

  async clearCurrentSession(telegramUserId: string): Promise<void> {
    await this.repository.clearByUserId(telegramUserId);
  }
}
