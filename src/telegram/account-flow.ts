import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountService } from "../services/account-service";
import { GroupService } from "../services/group-service";
import type { BotSessionService } from "../services/bot-session-service";
import type { BotSessionRecord } from "../storage/bot-sessions-repository";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult, TelegramInlineKeyboardMarkup } from "./types";
import { renderAccountAddedKeyboard } from "./menus";
import { formatAuditError } from "../utils/audit-labels";
import { renderTelegramOperationResult } from "./result-template";

export async function startAddAccountFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "setCurrentSession">,
  env?: Env,
  presetGroupId?: number
): Promise<TelegramClientResult> {
  await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_alias", data: presetGroupId ? { preset_group_id: presetGroupId } : undefined });
  return client.sendMessage({ chat_id: update.chatId, text: renderAddAccountAliasPrompt(presetGroupId), reply_markup: renderAddAccountAliasKeyboard(presetGroupId) });
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
      const presetGroupId = readPresetGroupId(session);
      const presetGroup = presetGroupId ? groups.groups.find((group) => group.id === presetGroupId) : undefined;
      const groupId = presetGroup?.id ?? 1;
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias, group_id: groupId } });
      return client.sendMessage({ chat_id: update.chatId, text: renderAddAccountTokenPrompt(alias, presetGroup?.name ?? "未分组"), reply_markup: renderAddAccountTokenKeyboard(groupId) });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias, group_id: 1 } });
    return client.sendMessage({ chat_id: update.chatId, text: renderAddAccountTokenPrompt(alias, "未分组"), reply_markup: renderAddAccountTokenKeyboard(1) });
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
        text: renderTelegramOperationResult({
          title: "账号添加成功",
          status: "success",
          requestId,
          fields: [
            { label: "账号", value: account.alias },
            { label: "分组", value: groupId === 1 ? "未分组" : `#${groupId}` },
            { label: "Token 状态", value: "可用" },
            { label: "服务器数量", value: account.server_count ?? 0 },
            { label: "安全基线", value: "已建立，历史登录不通知" }
          ],
          nextStep: "可继续添加账号，或进入账号列表查看详情"
        }),
        reply_markup: renderAccountAddedKeyboard(groupId)
      }) as TelegramClientAction);
      return actions;
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      const message = renderTelegramOperationResult({
        title: "添加账号",
        status: "failed",
        requestId,
        errorMessage: mapAccountFlowError(code, error instanceof Error ? error.message : undefined),
        errorCode: code,
        nextStep: "检查 Token 后重新发送，或点下方按钮取消/重填昵称"
      });
      actions.push(client.sendMessage({ chat_id: update.chatId, text: message, reply_markup: renderAddAccountTokenKeyboard(groupId ?? 1) }) as TelegramClientAction);
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

function readPresetGroupId(session: BotSessionRecord): number | null {
  const data = session.data_json ? JSON.parse(session.data_json) as { preset_group_id?: unknown } : {};
  if (data.preset_group_id === undefined || data.preset_group_id === null) return null;
  const groupId = Number(data.preset_group_id);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
}

export function renderAddAccountAliasPrompt(presetGroupId?: number): string {
  const groupHint = presetGroupId ? "\n已从分组入口进入，输入昵称后会加入当前分组。" : "";
  return [
    "➕ 添加账号",
    "",
    "第 1/2 步：请输入账号昵称。",
    "",
    "例如：西班牙1、日本备用、洛杉矶主号。",
    groupHint,
    "",
    "不想继续可以点下方按钮，或发送 /cancel。"
  ].filter(Boolean).join("\n");
}

export function renderAddAccountAliasKeyboard(presetGroupId?: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "取消添加", callback_data: "accounts:add:cancel" }],
      [{ text: presetGroupId ? "返回分组详情" : "返回账号管理", callback_data: presetGroupId ? `groups:detail:${presetGroupId}` : "menu:accounts" }]
    ]
  };
}

export function renderAddAccountTokenPrompt(alias: string, groupName: string): string {
  return [
    "➕ 添加账号",
    "",
    "第 2/2 步：请发送 Linode API Token。",
    "",
    `昵称：${alias}`,
    `分组：${groupName}`,
    "",
    "Bot 会检测 Token，并尝试删除你的 Token 消息。",
    "不想继续可以点下方按钮，或发送 /cancel。"
  ].join("\n");
}

export function renderAddAccountTokenKeyboard(groupId?: number | null): TelegramInlineKeyboardMarkup {
  const isGroup = Boolean(groupId && groupId > 1);
  return {
    inline_keyboard: [
      [{ text: "重新输入昵称", callback_data: `accounts:add:back_alias${isGroup ? `:${groupId}` : ""}` }],
      [{ text: "取消添加", callback_data: "accounts:add:cancel" }],
      [{ text: isGroup ? "返回分组详情" : "返回账号管理", callback_data: isGroup ? `groups:detail:${groupId}` : "menu:accounts" }]
    ]
  };
}

function mapAccountFlowError(code: ErrorCode, message?: string): string {
  if (code === ErrorCode.VALIDATION_ERROR && message?.includes("Token already exists")) {
    return message.replace("Token already exists for account", "这个 Token 已经添加过：");
  }
  switch (code) {
    case ErrorCode.TOKEN_INVALID:
      return "Token 无效：请检查是否复制完整，然后重新发送。";
    case ErrorCode.TOKEN_PERMISSION_ERROR:
      return "权限不足：请确认 Token 有读取账号、实例和登录事件权限，然后重新发送。";
    case ErrorCode.VALIDATION_ERROR:
      return "账号昵称或 Token 格式不正确，可以重新发送，或点下方按钮取消/重填昵称。";
    case ErrorCode.CONFIG_MISSING:
      return "系统配置缺失，请先执行 /setup 检查部署配置。";
    default:
      return formatAuditError(code);
  }
}
