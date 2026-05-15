import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountService } from "../services/account-service";
import type { BotSessionService } from "../services/bot-session-service";
import type { BotSessionRecord } from "../storage/bot-sessions-repository";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult } from "./types";
import { renderAccountAddedKeyboard } from "./menus";

export async function startAddAccountFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "setCurrentSession">
): Promise<TelegramClientResult> {
  await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_alias" });
  return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "账号添加\n\n请输入账号别名，例如 default。" });
}

export async function continueAddAccountFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "getCurrentSession" | "setCurrentSession" | "clearCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session) return null;

  if (session.state === "adding_account_alias") {
    const alias = update.text.trim();
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(alias)) {
      return client.sendMessage({ chat_id: update.chatId, text: "账号别名格式不正确。请使用 1-32 位字母、数字、下划线或短横线。" });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias } });
    return client.sendMessage({ chat_id: update.chatId, text: `别名已记录：${alias}\n\n请发送 Linode API Token。Bot 不会回显 Token，并会尝试删除你的 Token 消息。` });
  }

  if (session.state === "adding_account_token") {
    const alias = readAlias(session, requestId);
    const actions: TelegramClientAction[] = [client.deleteMessage(update.chatId, update.messageId) as TelegramClientAction];
    try {
      const account = await new AccountService(env).createAccount(
        { alias, token: update.text },
        { requestId, actor: `telegram:${update.fromId}`, source: "telegram" }
      );
      await sessions.clearCurrentSession(update.fromId);
      actions.push(client.sendMessage({
        chat_id: update.chatId,
        text: [`✅ 账号添加成功`, "", `账号：#${account.id} ${account.alias}`, `Token：${account.token_fingerprint}`, `状态：${account.token_status}`].join("\n"),
        reply_markup: renderAccountAddedKeyboard()
      }) as TelegramClientAction);
      return actions;
    } catch (error) {
      const message = error instanceof AppError ? mapAccountFlowError(error.code) : "添加账号失败，请稍后重试。";
      actions.push(client.sendMessage({ chat_id: update.chatId, text: message }) as TelegramClientAction);
      return actions;
    }
  }

  return null;
}

function readAlias(session: BotSessionRecord, requestId: string): string {
  const data = session.data_json ? JSON.parse(session.data_json) as { alias?: unknown } : {};
  if (typeof data.alias !== "string") throw new AppError(ErrorCode.VALIDATION_ERROR, "Missing alias in bot session", requestId, 400);
  return data.alias;
}

function mapAccountFlowError(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.TOKEN_INVALID:
      return "Linode Token 无效，请检查后重新发送。";
    case ErrorCode.TOKEN_PERMISSION_ERROR:
      return "Linode Token 权限不足，请确认 Token 权限后重新发送。";
    case ErrorCode.VALIDATION_ERROR:
      return "账号别名或 Token 格式不正确，请执行 /cancel 后重新添加。";
    case ErrorCode.CONFIG_MISSING:
      return "系统配置缺失，请先执行 /setup 检查部署配置。";
    default:
      return "Linode API 调用失败，请稍后重试或检查 Token。";
  }
}
