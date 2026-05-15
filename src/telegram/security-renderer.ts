import type { SecurityCheckResult } from "../services/security-service";
import type { SecurityEventRecord } from "../storage/events-repository";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderSecurityMenuText(openEvents: number, recentEvents: SecurityEventRecord[]): string {
  return [
    "账号安全",
    "",
    "优先处理未确认的 Linode / Akamai Cloud 控制台登录事件。",
    "不是 SSH 登录监控，也不是服务器内部登录监控。",
    "",
    `未确认事件：${openEvents}`,
    `最近事件：${recentEvents.length}`
  ].join("\n");
}

export function renderSecurityMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看未确认事件", callback_data: "security:events:open" }],
      [{ text: "手动检查登录", callback_data: "security:check" }],
      [{ text: "查看最近事件", callback_data: "security:events" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderSecurityEventsText(events: SecurityEventRecord[], title = "最近安全事件"): string {
  const lines = [title, ""];
  if (events.length === 0) lines.push(title.includes("未确认") ? "暂无未确认安全事件。" : "暂无安全事件。");
  for (const event of events.slice(0, 10)) {
    lines.push(
      `#${event.id} ${event.type}`,
      `账号：${event.account_id ?? "-"}`,
      `状态：${event.status}`,
      `用户：${event.username ?? "-"}`,
      `IP：${event.ip ?? "-"}`,
      `时间：${event.occurred_at}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderSecurityEventsKeyboard(events: SecurityEventRecord[] = []): TelegramInlineKeyboardMarkup {
  const openEvents = events.filter((event) => event.status === "open").slice(0, 5);
  return {
    inline_keyboard: [
      ...openEvents.map((event) => [
        { text: `#${event.id} 是我`, callback_data: `security:confirm:${event.id}` },
        { text: `#${event.id} 不是我`, callback_data: `security:suspicious:${event.id}` }
      ]),
      [{ text: "手动检查", callback_data: "security:check" }],
      [{ text: "返回账号安全事件", callback_data: "menu:security" }]
    ]
  };
}

export function renderSecurityCheckResultText(result: SecurityCheckResult): string {
  const lines = [
    "账号安全事件检查结果",
    "",
    `结果：${result.result}`,
    `检查账号：${result.checked_accounts}`,
    `失败账号：${result.failed_accounts}`,
    `新增登录事件：${result.new_login_events}`,
    `新增安全事件：${result.new_security_events}`
  ];
  const failed = result.items.filter((item) => item.result === "failed");
  if (failed.length > 0) {
    lines.push("", "失败账号：");
    for (const item of failed.slice(0, 10)) lines.push(`#${item.account_id} ${item.account_alias}：${item.error_code ?? "UNKNOWN"}`);
  }
  return lines.join("\n");
}

export function renderSecurityCheckResultKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "查看未确认事件", callback_data: "security:events:open" }], [{ text: "返回账号安全", callback_data: "menu:security" }]] };
}
