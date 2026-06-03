import type { WindowsInstallRecord } from "../storage/windows-install-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderWindowsInstallStatusText(records: WindowsInstallRecord[]): string {
  if (records.length === 0) return ["🪟 Windows 安装状态", "", "暂无 Windows 安装记录。", "创建 Windows 服务器后，这里会显示安装中 / 已完成状态。"].join("\n");
  const lines = ["🪟 Windows 安装状态", "━━━━━━━━━━━━"];
  for (const record of records) {
    lines.push(
      `#${record.id} ${record.instance_label ?? "Windows"}`,
      `状态：${formatInstallStatus(record.status)}`,
      record.instance_id ? `实例 ID：${record.instance_id}` : "实例 ID：创建后同步中",
      record.ip_address ? (record.rdp_ready_at ? `RDP：${record.ip_address}:3389` : `待检测地址：${record.ip_address}:3389`) : "RDP：等待公网 IPv4",
      `连接建议：${formatConnectionAdvice(record)}`,
      record.callback_received_at ? `完成回调：${record.callback_received_at}` : `创建时间：${record.created_at}`,
      record.rdp_ready_at ? `RDP 探测完成：${record.rdp_ready_at}` : record.status === "ready" ? `RDP 检测：等待连通${record.rdp_check_attempts ? `（已检测 ${record.rdp_check_attempts} 次）` : ""}` : "",
      record.rdp_ready_at ? `总耗时：${formatDuration(record.created_at, record.rdp_ready_at)}` : "",
      formatNotificationLine(record),
      ""
    );
  }
  return lines.join("\n").trim();
}

export function renderWindowsInstallStatusKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "🪟 创建 Windows 服务器", callback_data: "windows:create" }], [{ text: "🏠 返回服务器管理", callback_data: "menu:instances" }]] };
}

function formatInstallStatus(status: string): string {
  if (status === "ready") return "🟡 已进入系统，RDP 未确认";
  if (status === "failed") return "⚠️ 超时提醒已发送，仍等待完成回调";
  return "⏳ 安装中";
}

function formatConnectionAdvice(record: WindowsInstallRecord): string {
  if (record.rdp_ready_at) return "✅ 可以连接 RDP";
  if (record.status === "ready") return "🟡 暂时不要连接，等待 3389 探测通过";
  if (record.status === "failed") return "⚠️ 可手动尝试，但 Bot 尚未确认系统完成";
  return "⏳ 暂时不要连接，等待安装完成";
}

function formatNotificationLine(record: WindowsInstallRecord): string {
  if (!record.notified_at) return "通知状态：未通知";
  if (record.rdp_notified_at) return `RDP 探测完成：${record.rdp_notified_at}`;
  if (record.status === "ready") return `系统进入通知：${record.notified_at}`;
  if (record.status === "failed") return `超时提醒：${record.notified_at}`;
  return `通知时间：${record.notified_at}`;
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
