import { BotSessionsRepository } from "../storage/bot-sessions-repository";

export class BotSessionService {
  constructor(private readonly repository: BotSessionsRepository) {}

  async setCurrentSession(input: { telegramUserId: string; chatId: string; state: string; data?: unknown }): Promise<void> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
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
