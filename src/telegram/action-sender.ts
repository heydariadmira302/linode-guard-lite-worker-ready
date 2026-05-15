import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import type { TelegramClientAction, TelegramClientResult } from "./types";

export async function sendTelegramResult(botToken: string, result: TelegramClientResult): Promise<unknown[]> {
  const actions = Array.isArray(result) ? result : [result];
  const responses: unknown[] = [];
  for (const action of actions) responses.push(await sendTelegramAction(botToken, action));
  return responses;
}

export async function sendTelegramAction(botToken: string, action: TelegramClientAction): Promise<unknown> {
  if (isTestDryRunBotToken(botToken)) return { ok: true, dry_run: true, method: action.method };
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${action.method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action.payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AppError(ErrorCode.TELEGRAM_API_ERROR, text || "Telegram API error", "req_telegram", 502);
  }
  return await response.json().catch(() => ({}));
}

function isTestDryRunBotToken(botToken: string): boolean {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  return nodeEnv === "test" && (botToken === "bot-token" || botToken === "***");
}
