import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import type { BotSessionService } from "../services/bot-session-service";
import { DiagnosticsService } from "../services/setup-service";
import type { ParsedTelegramUpdate, TelegramClientResult } from "./types";
import { continueAddAccountFlow } from "./account-flow";
import { renderHelpText, renderMainMenuKeyboard, renderMainMenuText } from "./menus";
import { renderSetupWizardText } from "./setup-renderer";

export async function handleTelegramMessageCommand(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult> {
  switch (update.command) {
    case "start":
      return client.sendMessage({ chat_id: update.chatId, text: renderMainMenuText(), reply_markup: renderMainMenuKeyboard() });
    case "help":
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
    case "setup": {
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.sendMessage({ chat_id: update.chatId, text: renderSetupWizardText(deployment, jobs) });
    }
    case "cancel":
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "已取消当前操作。" });
    default: {
      const flowResult = await continueAddAccountFlow(update, client, sessions, env, requestId);
      if (flowResult) return flowResult;
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
    }
  }
}
