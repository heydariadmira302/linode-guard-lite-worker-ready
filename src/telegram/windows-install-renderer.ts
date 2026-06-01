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
      record.ip_address ? `RDP：${record.ip_address}:3389` : "RDP：等待公网 IPv4",
      record.callback_received_at ? `完成回调：${record.callback_received_at}` : `创建时间：${record.created_at}`,
      record.notified_at ? `已通知：${record.notified_at}` : "已通知：否",
      ""
    );
  }
  return lines.join("\n").trim();
}

export function renderWindowsInstallStatusKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "🔄 刷新状态", callback_data: "windows:install_status" }], [{ text: "🪟 创建 Windows 服务器", callback_data: "windows:create" }], [{ text: "🏠 返回服务器管理", callback_data: "menu:instances" }]] };
}

function formatInstallStatus(status: string): string {
  if (status === "ready") return "✅ 已完成，可尝试 RDP";
  if (status === "failed") return "⚠️ 可能超时 / 回调失败";
  return "⏳ 安装中";
}
