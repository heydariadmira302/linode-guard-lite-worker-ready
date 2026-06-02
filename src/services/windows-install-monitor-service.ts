import type { Env } from "../env";
import { ErrorCode } from "../errors/error-codes";
import { AppError } from "../errors/app-error";
import { WindowsInstallRepository, type WindowsInstallRecord } from "../storage/windows-install-repository";
import { sendTelegramAction } from "../telegram/action-sender";
import { probeTcpPort, type TcpProbeResult } from "./tcp-probe-service";

export interface WindowsInstallCallbackInput {
  token: string;
  ip_address?: string;
  rdp_port?: number;
  status?: string;
  message?: string;
}

export class WindowsInstallMonitorService {
  private readonly repository: WindowsInstallRepository;
  constructor(private readonly env: Env, repository?: WindowsInstallRepository, private readonly tcpProbe: (host: string, port: number, timeoutMs?: number) => Promise<TcpProbeResult> = probeTcpPort) {
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
    const existing = await this.repository.findPendingByTokenHash(tokenHash);
    if (!existing) throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid or already used Windows install callback token", requestId, 401);
    const record = await this.repository.markReady(existing.id, { ipAddress: normalizeIp(input.ip_address) ?? null, metadata: { status: input.status ?? "ready", message: input.message ?? null, rdp_port: input.rdp_port ?? 3389 } });
    if (!record) throw new AppError(ErrorCode.JOB_FAILED, "Failed to update Windows install status", requestId, 500);
    const notified = await this.notifyInstallCallback(record);
    if (notified) await this.repository.markNotified(record.id);
    return { record, notified };
  }


  async notifyStaleInstalls(now = new Date(), olderThanMinutes = 45): Promise<{ checked: number; notified: number }> {
    const olderThan = new Date(now.getTime() - olderThanMinutes * 60 * 1000).toISOString();
    const stale = await this.repository.findStaleInstalling(olderThan, 20);
    let notified = 0;
    for (const record of stale) {
      if (record.notified_at) continue;
      const ok = await this.notifyTimeout(record, olderThanMinutes);
      if (ok) {
        await this.repository.markFailed(record.id, { reason: "install_callback_timeout", older_than_minutes: olderThanMinutes, note: "Timeout notification sent; late install callbacks are still accepted." });
        await this.repository.markNotified(record.id);
        notified += 1;
      }
    }
    return { checked: stale.length, notified };
  }

  private async notifyTimeout(record: WindowsInstallRecord, olderThanMinutes: number): Promise<boolean> {
    const chatId = record.telegram_chat_id || this.env.SUPER_ADMIN_TELEGRAM_ID;
    if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return false;
    const text = [
      "⏱ Windows 安装可能已接近完成，但还没收到完成回调",
      "",
      `服务器：${record.instance_label}`,
      record.instance_id ? `实例 ID：${record.instance_id}` : null,
      record.ip_address ? `RDP：${record.ip_address}:3389` : null,
      "",
      `已超过约 ${olderThanMinutes} 分钟。你可以尝试 RDP 登录，或进入 LISH Console 检查安装状态。`,
      "如果 RDP 连不上，请确认 Linode Firewall 已放行 TCP 3389。"
    ].filter(Boolean).join("\n");
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "sendMessage", payload: { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: "📡 Windows 安装状态", callback_data: "windows:install_status" }], [{ text: "🖥 服务器管理", callback_data: "menu:instances" }]] } } } as any);
    return Boolean((result as { ok?: boolean } | undefined)?.ok);
  }

  async checkRdpReadiness(_now = new Date(), limit = 20): Promise<{ checked: number; ready: number; notified: number }> {
    const pending = await this.repository.findRdpPending(limit);
    let ready = 0;
    let notified = 0;
    for (const record of pending) {
      const ip = record.ip_address;
      if (!ip) continue;
      const probe = await this.tcpProbe(ip, 3389, 3000);
      if (!probe.ok) {
        await this.repository.markRdpCheck(record.id, probe.error ?? "rdp_not_ready");
        continue;
      }
      const updated = await this.repository.markRdpReady(record.id);
      await this.repository.markRdpCheck(record.id, null);
      if (!updated) continue;
      ready += 1;
      if (!updated.rdp_notified_at && await this.notifyRdpReady(updated)) {
        await this.repository.markRdpNotified(updated.id);
        notified += 1;
      }
    }
    return { checked: pending.length, ready, notified };
  }

  private async notifyInstallCallback(record: WindowsInstallRecord): Promise<boolean> {
    const chatId = record.telegram_chat_id || this.env.SUPER_ADMIN_TELEGRAM_ID;
    if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return false;
    const ip = record.ip_address || "请在 Linode 控制台查看公网 IPv4";
    const text = [
      "✅ Windows 已进入系统，开始检测 RDP 可用性",
      "",
      `服务器：${record.instance_label}`,
      record.instance_id ? `实例 ID：${record.instance_id}` : null,
      `RDP：${ip}:3389`,
      `用户名：${getWindowsUsername(record)}`,
      "",
      "密码不会重复发送，请使用创建成功页里的一次性密码。",
      "Bot 会继续检测 3389，真正可远程登录后会再发一条成功通知。"
    ].filter(Boolean).join("\n");
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "sendMessage", payload: { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: "📡 Windows 安装状态", callback_data: "windows:install_status" }], [{ text: "🖥 服务器管理", callback_data: "menu:instances" }]] } } } as any);
    return Boolean((result as { ok?: boolean } | undefined)?.ok);
  }

  private async notifyRdpReady(record: WindowsInstallRecord): Promise<boolean> {
    const chatId = record.telegram_chat_id || this.env.SUPER_ADMIN_TELEGRAM_ID;
    if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return false;
    const ip = record.ip_address || "请在 Linode 控制台查看公网 IPv4";
    const text = [
      "✅ Windows 已可远程登录",
      "",
      `服务器：${record.instance_label}`,
      record.instance_id ? `实例 ID：${record.instance_id}` : null,
      `RDP：${ip}:3389`,
      `用户名：${getWindowsUsername(record)}`,
      `耗时：${formatDuration(record.created_at, record.rdp_ready_at ?? new Date().toISOString())}`,
      "",
      "密码不会重复发送，请使用创建成功页里的一次性密码。"
    ].filter(Boolean).join("\n");
    const result = await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "sendMessage", payload: { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: "📡 Windows 安装状态", callback_data: "windows:install_status" }], [{ text: "🖥 服务器管理", callback_data: "menu:instances" }]] } } } as any);
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

function getWindowsUsername(record: WindowsInstallRecord): string {
  try {
    const metadata = record.metadata_json ? JSON.parse(record.metadata_json) as Record<string, unknown> : null;
    const username = typeof metadata?.windows_username === "string" && metadata.windows_username.trim() ? metadata.windows_username.trim() : "Administrator";
    return username.slice(0, 64);
  } catch {
    return "Administrator";
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "未知";
  const totalMinutes = Math.max(1, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分钟`;
  if (minutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${minutes} 分钟`;
}
