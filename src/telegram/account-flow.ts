import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountService } from "../services/account-service";
import { GroupService } from "../services/group-service";
import type { BotSessionService } from "../services/bot-session-service";
import type { BotSessionRecord } from "../storage/bot-sessions-repository";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult } from "./types";
import { renderAccountAddedKeyboard } from "./menus";
import { renderGroupSelectKeyboard, renderGroupSelectText } from "./group-renderer";

export async function startAddAccountFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "setCurrentSession">,
  env?: Env
): Promise<TelegramClientResult> {
  await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_alias" });
  return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "账号添加\n\n请输入账号别名/昵称，例如：西班牙1、日本备用、洛杉矶主号。" });
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
    if (!/^[\p{Script=Han}a-zA-Z0-9 _-]{1,32}$/u.test(alias)) {
      return client.sendMessage({ chat_id: update.chatId, text: "账号昵称格式不正确。请使用 1-32 位中文、英文、数字、空格、下划线或短横线。" });
    }
    if (env.DB) {
      const groups = await new GroupService(env).listGroups();
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_group", data: { alias } });
      return client.sendMessage({ chat_id: update.chatId, text: renderGroupSelectText(groups.groups, alias), reply_markup: renderGroupSelectKeyboard(groups.groups, alias) });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias, group_id: 1 } });
    return client.sendMessage({ chat_id: update.chatId, text: `昵称已记录：${alias}\n分组：未分组\n\n请发送 Linode API Token。Bot 会调用 Linode API 检测 Token，并尝试删除你的 Token 消息。` });
  }

  if (session.state === "adding_account_token") {
    const alias = readAlias(session, requestId);
    const groupId = readGroupId(session, requestId);
    const actions: TelegramClientAction[] = [client.deleteMessage(update.chatId, update.messageId) as TelegramClientAction];
    try {
      const account = await new AccountService(env).createAccount(
        { alias, token: update.text, group_id: groupId },
        { requestId, actor: `telegram:${update.fromId}`, source: "telegram" }
      );
      await sessions.clearCurrentSession(update.fromId);
      actions.push(client.sendMessage({
        chat_id: update.chatId,
        text: [
          `✅ 账号添加成功`,
          "",
          `账号：${account.alias}`,
          `分组：${groupId === 1 ? "未分组" : `#${groupId}`}`,
          `Token 状态：可用`,
          `服务器数量：${account.server_count ?? 0}`,
          `安全基线：已建立，历史登录不通知`
        ].join("\n"),
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

function readGroupId(session: BotSessionRecord, requestId: string): number | null {
  const data = session.data_json ? JSON.parse(session.data_json) as { group_id?: unknown } : {};
  if (data.group_id === undefined || data.group_id === null) return 1;
  const groupId = Number(data.group_id);
  if (!Number.isInteger(groupId) || groupId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Missing group id in bot session", requestId, 400);
  return groupId;
}

function mapAccountFlowError(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.TOKEN_INVALID:
      return "Token 无效：请检查是否复制完整，然后重新发送。";
    case ErrorCode.TOKEN_PERMISSION_ERROR:
      return "权限不足：请确认 Token 有读取账号、实例和登录事件权限，然后重新发送。";
    case ErrorCode.VALIDATION_ERROR:
      return "账号昵称或 Token 格式不正确，请执行 /cancel 后重新添加。";
    case ErrorCode.CONFIG_MISSING:
      return "系统配置缺失，请先执行 /setup 检查部署配置。";
    default:
      return "Linode API 暂时不可用：请稍后重试或检查 Token 权限。";
  }
}
