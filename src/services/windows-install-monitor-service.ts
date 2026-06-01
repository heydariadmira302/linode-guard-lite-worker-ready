import type { Env } from "../env";
import { ErrorCode } from "../errors/error-codes";
import { AppError } from "../errors/app-error";
import { WindowsInstallRepository, type WindowsInstallRecord } from "../storage/windows-install-repository";
import { sendTelegramAction } from "../telegram/action-sender";

export interface WindowsInstallCallbackInput {
  token: string;
  ip_address?: string;
  rdp_port?: number;
  status?: string;
  message?: string;
}

export class WindowsInstallMonitorService {
  private readonly repository: WindowsInstallRepository;
  constructor(private readonly env: Env, repository?: WindowsInstallRepository) {
    if (!env.DB && !repository) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_windows_install", 500);
    this.repository = repository ?? new WindowsInstallRepository(env.DB as D1Database);
  }

  async createInstallRecord(input: { accountId: number; instanceLabel: string; ipAddress?: string | null; telegramChatId?: string | null; telegramUserId?: string | null; metadata?: Record<string, unknown> }): Promise<{ record: WindowsInstallRecord; callbackToken: string }> {
    const callbackToken = generateInstallCallbackToken();
    const callbackTokenHash = await hashInstallCallbackToken(callbackToken);
    const record = await this.repository.create({ ...input, callbackTokenHash });
    return { record, callbackToken };
  }

  async handleCallback(input: WindowsInstallCallbackInput, requestId: string): Promise<{ record: WindowsInstallRecord; notified: boolean }> {
    if (!input.token || input.token.length < 24) throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid Windows install callback token", requestId, 401);
    const tokenHash = await hashInstallCallbackToken(input.token);
    const existing = await this.repository.findInstallingByTokenHash(tokenHash);
    if (!existing) throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid or already used Windows install callback token", requestId, 401);
    const record = await this.repository.markReady(existing.id, { ipAddress: normalizeIp(input.ip_address) ?? null, metadata: { status: input.status ?? "ready", message: input.message ?? null, rdp_port: input.rdp_port ?? 3389 } });
    if (!record) throw new AppError(ErrorCode.JOB_FAILED, "Failed to update Windows install status", requestId, 500);
    const notified = await this.notifyReady(record);
    if (notified) await this.repository.markNotified(record.id);
    return { record, notified };
  }

  private async notifyReady(record: WindowsInstallRecord): Promise<boolean> {
    const chatId = record.telegram_chat_id || this.env.SUPER_ADMIN_TELEGRAM_ID;
    if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return false;
    const ip = record.ip_address || "请在 Linode 控制台查看公网 IPv4";
    const text = [
      "✅ Windows 安装完成，可以尝试远程桌面登录了",
      "",
      `服务器：${record.instance_label}`,
      record.instance_id ? `实例 ID：${record.instance_id}` : null,
      `RDP：${ip}:3389`,
      "用户名：Administrator",
      "",
      "密码不会重复发送，请使用创建成功页里的一次性密码。",
      "如果暂时连不上，请再等 1-2 分钟，并确认 Linode Firewall 已放行 TCP 3389。"
    ].filter(Boolean).join("\n");
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "sendMessage", payload: { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: "🖥 服务器管理", callback_data: "menu:instances" }]] } } } as any);
    return Boolean((result as { ok?: boolean } | undefined)?.ok);
  }
}

export function generateInstallCallbackToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashInstallCallbackToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeIp(value?: string): string | undefined {
  const ip = String(value ?? "").trim();
  return ip.length > 0 && ip.length <= 64 ? ip : undefined;
}
