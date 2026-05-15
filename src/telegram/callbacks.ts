import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { mapTelegramErrorMessage } from "../errors/telegram-error-messages";
import type { BotSessionService } from "../services/bot-session-service";
import { AccountService } from "../services/account-service";
import { AuditService } from "../services/audit-service";
import { AdminPresenceService } from "../services/admin-presence-service";
import { BatchService, type BatchAction } from "../services/batch-service";
import { InstanceService } from "../services/instance-service";
import { ScheduleService } from "../services/schedule-service";
import { DiagnosticsService } from "../services/setup-service";
import { SecurityService } from "../services/security-service";
import { AuditRepository } from "../storage/audit-repository";
import type { ParsedTelegramUpdate, TelegramClientResult } from "./types";
import { renderAdminPresenceCheckinText, renderAdminPresenceMenuKeyboard, renderAdminPresenceMenuText, renderAdminPresencePoliciesKeyboard, renderAdminPresencePoliciesText } from "./admin-presence-renderer";
import { renderAuditLogsKeyboard, renderAuditLogsText } from "./audit-renderer";
import { renderBatchAccountsKeyboard, renderBatchAccountsText, renderBatchMenuKeyboard, renderBatchMenuText, renderBatchResultKeyboard, renderBatchResultText } from "./batch-renderer";
import { renderScheduleListKeyboard, renderScheduleListText, renderSchedulesMenuKeyboard, renderSchedulesMenuText } from "./schedule-renderer";
import { renderSecurityCheckResultKeyboard, renderSecurityCheckResultText, renderSecurityEventsKeyboard, renderSecurityEventsText, renderSecurityMenuKeyboard, renderSecurityMenuText } from "./security-renderer";
import { renderAccountListKeyboard, renderAccountListText, renderAccountsMenuKeyboard, renderAccountsMenuText, renderDiagnosticsMenuKeyboard, renderDiagnosticsMenuText, renderMainMenuKeyboard, renderMainMenuText, renderSettingsMenuKeyboard, renderSettingsMenuText } from "./menus";
import { startAddAccountFlow } from "./account-flow";
import {
  renderAccountInstancesText,
  renderAllInstancesText,
  renderInstanceAccountsKeyboard,
  renderInstanceAccountsText,
  renderInstanceDetailText,
  renderInstancesListKeyboard,
  renderInstancesMenuKeyboard,
  renderInstancesMenuText
} from "./instance-renderer";

export async function routeTelegramCallback(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions?: Pick<BotSessionService, "setCurrentSession">,
  env?: Env,
  requestId = "req_telegram"
): Promise<TelegramClientResult> {
  if (update.data === "menu:main") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderMainMenuText(),
      reply_markup: renderMainMenuKeyboard()
    });
  }

  if (update.data === "menu:accounts") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAccountsMenuText(),
      reply_markup: renderAccountsMenuKeyboard()
    });
  }

  if (update.data === "accounts:list" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountListText(accounts), reply_markup: renderAccountListKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "accounts:add" && sessions) {
    return await startAddAccountFlow(update, client, sessions);
  }

  if (update.data === "menu:instances") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderInstancesMenuText(),
      reply_markup: renderInstancesMenuKeyboard()
    });
  }

  if (update.data === "menu:audit_logs" && env?.DB) {
    const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs({ limit: 20, offset: 0 });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAuditLogsText(data.audit_logs),
      reply_markup: renderAuditLogsKeyboard()
    });
  }

  if (update.data === "menu:batch") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderBatchMenuText(),
      reply_markup: renderBatchMenuKeyboard()
    });
  }

  if (update.data === "menu:diagnostics" && env) {
    try {
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderDiagnosticsMenuText(deployment.status, jobs.missing, jobs.disabled),
        reply_markup: renderDiagnosticsMenuKeyboard()
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "menu:settings") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSettingsMenuText(), reply_markup: renderSettingsMenuKeyboard() });
  }

  if (update.data === "menu:schedules") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSchedulesMenuText(), reply_markup: renderSchedulesMenuKeyboard() });
  }

  if (update.data === "schedules:list" && env?.DB) {
    try {
      const data = await new ScheduleService(env).listSchedules({ limit: 10, offset: 0 });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleListText(data.schedules), reply_markup: renderScheduleListKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "menu:security" && env?.DB) {
    try {
      const data = await new SecurityService(env).getOverview();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecurityMenuText(data.open_events, data.recent_events), reply_markup: renderSecurityMenuKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "menu:admin_presence" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).getStatus();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceMenuText(data), reply_markup: renderAdminPresenceMenuKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:checkin" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).checkin({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceCheckinText(data), reply_markup: renderAdminPresenceMenuKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:policies" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).listPolicies({ limit: 10, offset: 0 });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePoliciesText(data.policies), reply_markup: renderAdminPresencePoliciesKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if ((update.data === "security:events" || update.data === "security:events:open") && env?.DB) {
    try {
      const openOnly = update.data === "security:events:open";
      const data = await new SecurityService(env).listSecurityEvents({ limit: 10, offset: 0, status: openOnly ? "open" : undefined });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderSecurityEventsText(data.security_events, openOnly ? "未确认安全事件" : "最近安全事件"),
        reply_markup: renderSecurityEventsKeyboard(data.security_events)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "security:check" && env?.DB) {
    try {
      const data = await new SecurityService(env).checkAccounts({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecurityCheckResultText(data), reply_markup: renderSecurityCheckResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const securityEventStatusMatch = update.data.match(/^security:(confirm|suspicious):(\d+)$/);
  if (securityEventStatusMatch && env?.DB) {
    try {
      const status = securityEventStatusMatch[1] === "confirm" ? "confirmed" : "suspicious";
      const data = await new SecurityService(env).updateSecurityEventStatus(Number(securityEventStatusMatch[2]), status, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: [`安全事件已更新`, "", `事件：#${data.security_event.id}`, `状态：${data.security_event.status}`].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "返回未确认事件", callback_data: "security:events:open" }], [{ text: "返回账号安全", callback_data: "menu:security" }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAccountsMatch = update.data.match(/^batch:accounts:(boot|shutdown|delete)$/);
  if (batchAccountsMatch && env) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      const action = batchAccountsMatch[1] as BatchAction;
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderBatchAccountsText(action),
        reply_markup: renderBatchAccountsKeyboard(accounts, action)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAccountRunMatch = update.data.match(/^batch:account:(boot|shutdown|delete):(\d+)$/);
  if (batchAccountRunMatch && env) {
    try {
      const action = batchAccountRunMatch[1] as BatchAction;
      const data = await new BatchService(env).runAccountBatch(Number(batchAccountRunMatch[2]), action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAllRunMatch = update.data.match(/^batch:all:(boot|shutdown|delete)$/);
  if (batchAllRunMatch && env) {
    try {
      const action = batchAllRunMatch[1] as BatchAction;
      const data = await new BatchService(env).runAllAccountsBatch(action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "instances:list:all" && env) {
    try {
      const data = await new InstanceService(env).listAllActiveAccountInstances(requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderAllInstancesText(data.accounts),
        reply_markup: renderInstancesListKeyboard(data.accounts)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "instances:accounts" && env) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceAccountsText(accounts),
        reply_markup: renderInstanceAccountsKeyboard(accounts)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountListMatch = update.data.match(/^instances:list:account:(\d+)$/);
  if (accountListMatch && env) {
    try {
      const data = await new InstanceService(env).listAccountInstances(Number(accountListMatch[1]), requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderAccountInstancesText(data),
        reply_markup: renderInstancesListKeyboard([data])
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const bootMatch = update.data.match(/^instances:boot:(\d+):(\d+)$/);
  if (bootMatch && env) {
    try {
      const data = await new InstanceService(env).bootInstance(Number(bootMatch[1]), Number(bootMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: [`开机请求已发送`, "", `账号：#${data.account.id} ${data.account.alias}`, `实例：#${data.instance_id}`].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const shutdownMatch = update.data.match(/^instances:shutdown:(\d+):(\d+)$/);
  if (shutdownMatch && env) {
    try {
      const data = await new InstanceService(env).shutdownInstance(Number(shutdownMatch[1]), Number(shutdownMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: [`关机请求已发送`, "", `账号：#${data.account.id} ${data.account.alias}`, `实例：#${data.instance_id}`].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const rebootMatch = update.data.match(/^instances:reboot:(\d+):(\d+)$/);
  if (rebootMatch && env) {
    try {
      const data = await new InstanceService(env).rebootInstance(Number(rebootMatch[1]), Number(rebootMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: [`重启请求已发送`, "", `账号：#${data.account.id} ${data.account.alias}`, `实例：#${data.instance_id}`].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const deleteMatch = update.data.match(/^instances:delete:(\d+):(\d+)$/);
  if (deleteMatch && env) {
    try {
      const data = await new InstanceService(env).deleteInstance(Number(deleteMatch[1]), Number(deleteMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: [`删除请求已发送`, "", `账号：#${data.account.id} ${data.account.alias}`, `实例：#${data.instance_id}`].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const detailMatch = update.data.match(/^instances:detail:(\d+):(\d+)$/);
  if (detailMatch && env) {
    try {
      const data = await new InstanceService(env).getAccountInstance(Number(detailMatch[1]), Number(detailMatch[2]), requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceDetailText(data),
        reply_markup: {
          inline_keyboard: [
            [
              { text: "开机", callback_data: `instances:boot:${data.account.id}:${data.instance.id}` },
              { text: "关机", callback_data: `instances:shutdown:${data.account.id}:${data.instance.id}` },
              { text: "重启", callback_data: `instances:reboot:${data.account.id}:${data.instance.id}` }
            ],
            [{ text: "删除", callback_data: `instances:delete:${data.account.id}:${data.instance.id}` }],
            [{ text: "返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]
          ]
        }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  return client.editMessage({
    chat_id: update.chatId,
    message_id: update.messageId,
    text: `暂不支持的菜单入口：${update.data}\n后续阶段会通过 inline keyboard 逐步接入。`,
    reply_markup: renderMainMenuKeyboard()
  });
}

function renderTelegramCallbackError(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  error: unknown,
  requestId: string
): TelegramClientResult {
  const appError = error instanceof AppError
    ? error
    : new AppError(ErrorCode.LINODE_API_ERROR, "Operation failed", requestId, 502);
  return client.editMessage({
    chat_id: update.chatId,
    message_id: update.messageId,
    text: ["操作失败", "", mapTelegramErrorMessage(appError.code)].join("\n"),
    reply_markup: { inline_keyboard: [[{ text: "返回主菜单", callback_data: "menu:main" }]] }
  });
}
