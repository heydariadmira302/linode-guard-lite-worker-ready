import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import type { TelegramClientAction, TelegramClientResult } from "./types";

export async function sendTelegramResult(botToken: string, result: TelegramClientResult): Promise<unknown[]> {
  const actions = Array.isArray(result) ? result : [result];
  const responses: unknown[] = [];
  for (const action of actions) responses.push(await sendTelegramActionWithFallback(botToken, action));
  return responses;
}

async function sendTelegramActionWithFallback(botToken: string, action: TelegramClientAction): Promise<unknown> {
  try {
    return await sendTelegramAction(botToken, action);
  } catch (error) {
    if (action.method !== "editMessageText" || !isRecoverableEditMessageError(error) || isRefreshDetailAction(action)) throw error;
    return await sendTelegramAction(botToken, {
      method: "sendMessage",
      payload: {
        chat_id: action.payload.chat_id,
        text: action.payload.text,
        reply_markup: action.payload.reply_markup
      }
    });
  }
}

export async function sendTelegramAction(botToken: string, action: TelegramClientAction): Promise<unknown> {
  const outgoingAction = beautifyTelegramAction(action);
  if (isTestDryRunBotToken(botToken)) return { ok: true, dry_run: true, method: outgoingAction.method };
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${outgoingAction.method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(outgoingAction.payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AppError(ErrorCode.TELEGRAM_API_ERROR, text || "Telegram API error", "req_telegram", 502, { telegram_method: outgoingAction.method });
  }
  return await response.json().catch(() => ({}));
}

function beautifyTelegramAction(action: TelegramClientAction): TelegramClientAction {
  if ((action.method !== "sendMessage" && action.method !== "editMessageText") || !action.payload.reply_markup) return action;
  const markup = action.payload.reply_markup;
  if (!("inline_keyboard" in markup)) return action;
  return {
    ...action,
    payload: {
      ...action.payload,
      reply_markup: {
        inline_keyboard: markup.inline_keyboard.map((row) => row.map((button) => ({ ...button, text: beautifyButtonText(button.text) })))
      }
    }
  } as TelegramClientAction;
}

function beautifyButtonText(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  if (/^[✅🚨⚠️❤️🛡⚡📋📄🖥📁👤⏰⚙️🏠🔄➕✏️▶️⏸↩️❌🗑🔍]/u.test(text)) return text;
  if (text.includes("删除") || text.includes("删机")) return `🚨 ${text}`;
  if (text.includes("确认") || text.includes("执行") || text.includes("开机") || text.includes("启用")) return `✅ ${text}`;
  if (text.includes("关机") || text.includes("停用") || text.includes("高危")) return `⚠️ ${text}`;
  if (text.includes("打卡") || text.includes("保活")) return `❤️ ${text}`;
  if (text.includes("新建") || text.includes("添加") || text.includes("继续添加")) return `➕ ${text}`;
  if (text.includes("编辑") || text.includes("修改") || text.includes("重命名")) return `✏️ ${text}`;
  if (text.includes("查看") || text.includes("详情") || text.includes("列表")) return `📋 ${text}`;
  if (text.includes("刷新")) return `🔄 ${text}`;
  if (text.includes("取消") || text.includes("返回")) return `↩️ ${text}`;
  if (text.includes("服务器")) return `🖥 ${text}`;
  if (text.includes("账号")) return `👤 ${text}`;
  if (text.includes("分组")) return `📁 ${text}`;
  if (text.includes("定时")) return `⏰ ${text}`;
  return text;
}

function isRefreshDetailAction(action: TelegramClientAction): boolean {
  if (action.method !== "editMessageText") return false;
  const markup = action.payload.reply_markup;
  if (!markup || !("inline_keyboard" in markup)) return false;
  return markup.inline_keyboard.flat().some((button) => "callback_data" in button && typeof button.callback_data === "string" && button.callback_data.startsWith("instances:detail:"));
}

function isRecoverableEditMessageError(error: unknown): boolean {
  if (!(error instanceof AppError) || error.code !== ErrorCode.TELEGRAM_API_ERROR) return false;
  const message = error.message.toLowerCase();
  return [
    "message is not modified",
    "message to edit not found",
    "message can't be edited",
    "message can\u2019t be edited",
    "there is no text in the message to edit"
  ].some((item) => message.includes(item));
}

function isTestDryRunBotToken(botToken: string): boolean {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  return nodeEnv === "test" && (botToken === "bot-token" || botToken === "***");
}
