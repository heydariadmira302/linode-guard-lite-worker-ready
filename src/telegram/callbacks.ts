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
import { renderAdminPresenceCheckinText, renderAdminPresenceDeletePolicyWarning, renderAdminPresenceMenuKeyboard, renderAdminPresenceMenuText, renderAdminPresencePoliciesKeyboard, renderAdminPresencePoliciesText, renderAdminPresencePolicyAccountKeyboard, renderAdminPresencePolicyAccountText, renderAdminPresencePolicyActionKeyboard, renderAdminPresencePolicyActionText, renderAdminPresencePolicyCreateKeyboard, renderAdminPresencePolicyCreateText, renderAdminPresencePolicyDeleteConfirmKeyboard, renderAdminPresencePolicyDeleteConfirmText, renderAdminPresencePolicyDeletedText, renderAdminPresencePolicyDetailKeyboard, renderAdminPresencePolicyDetailText, renderAdminPresencePolicyEditAccountKeyboard, renderAdminPresencePolicyEditActionKeyboard, renderAdminPresencePolicyEditGroupKeyboard, renderAdminPresencePolicyEditKeyboard, renderAdminPresencePolicyEditScopeKeyboard, renderAdminPresencePolicyEditText, renderAdminPresencePolicyEditTimeKeyboard, renderAdminPresencePolicyFinalTimeKeyboard, renderAdminPresencePolicyFinalTimeText, renderAdminPresencePolicyGroupKeyboard, renderAdminPresencePolicyGroupText, renderAdminPresencePolicyNamePrompt, renderAdminPresencePolicyScopeKeyboard, renderAdminPresencePolicyScopeText, renderAdminPresencePolicyTimeKeyboard, renderAdminPresencePolicyTimeText, renderAdminPresencePolicyUpdatedText } from "./admin-presence-renderer";
import { renderAuditLogsKeyboard, renderAuditLogsText } from "./audit-renderer";
import { renderBatchAccountsKeyboard, renderBatchAccountsText, renderBatchConfirmKeyboard, renderBatchConfirmText, renderBatchMenuKeyboard, renderBatchMenuText, renderBatchResultKeyboard, renderBatchResultText } from "./batch-renderer";
import { renderScheduleActionResultKeyboard, renderScheduleActionResultText, renderScheduleBulkToggleConfirmKeyboard, renderScheduleBulkToggleConfirmText, renderScheduleBulkToggleResultText, renderScheduleCreateAccountKeyboard, renderScheduleCreateAccountText, renderScheduleCreateActionKeyboard, renderScheduleCreateActionText, renderScheduleCreateGroupKeyboard, renderScheduleCreateGroupText, renderScheduleCreatePresetKeyboard, renderScheduleCreatePresetText, renderScheduleCreateScopeKeyboard, renderScheduleCreateScopeText, renderScheduleCustomTimePrompt, renderScheduleDeleteConfirmKeyboard, renderScheduleDeleteConfirmText, renderScheduleListKeyboard, renderScheduleListText, renderSchedulesMenuKeyboard, renderSchedulesMenuText } from "./schedule-renderer";
import { renderSecurityCheckResultKeyboard, renderSecurityCheckResultText, renderSecurityEventStatusUpdateText, renderSecurityEventsKeyboard, renderSecurityEventsText, renderSecurityMenuKeyboard, renderSecurityMenuText } from "./security-renderer";
import { renderCheckinInlineKeyboard } from "./keyboards";
import { renderAccountActionResultText, renderAccountDeleteConfirmKeyboard, renderAccountDeleteConfirmText, renderAccountDetailKeyboard, renderAccountDetailText, renderAccountListKeyboard, renderAccountListText, renderAccountsMenuKeyboard, renderAccountsMenuText, renderDiagnosticsMenuKeyboard, renderDiagnosticsMenuText, renderMainMenuKeyboard, renderMainMenuText, renderSettingsMenuKeyboard, renderSettingsMenuText } from "./menus";
import { GroupService } from "../services/group-service";
import { renderGroupAccountsKeyboard, renderGroupAccountsText, renderGroupDeleteConfirmKeyboard, renderGroupDeleteConfirmText, renderGroupDetailKeyboard, renderGroupDetailText, renderGroupInstancesKeyboard, renderGroupInstancesText, renderGroupSelectKeyboard, renderGroupSelectText, renderGroupsListKeyboard, renderGroupsMenuKeyboard, renderGroupsMenuText } from "./group-renderer";
import { startAddAccountFlow } from "./account-flow";
import {
  renderAccountInstanceBlock,
  renderAccountInstancesText,
  renderAllInstancesText,
  renderInstanceAccountsKeyboard,
  renderInstanceAccountsText,
  renderInstanceDetailKeyboard,
  renderInstanceDetailText,
  renderInstanceGroupsKeyboard,
  renderInstanceGroupsText,
  renderInstancesListKeyboard,
  renderInstancesMenuKeyboard,
  renderInstancesMenuText
} from "./instance-renderer";

export async function routeTelegramCallback(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions?: Pick<BotSessionService, "getCurrentSession" | "setCurrentSession">,
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

  if (update.data === "menu:groups" && env?.DB) {
    try {
      const data = await new GroupService(env).listGroups();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupsMenuText(data.groups), reply_markup: renderGroupsMenuKeyboard(data.groups) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "groups:list" && env?.DB) {
    try {
      const data = await new GroupService(env).listGroups();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupsMenuText(data.groups), reply_markup: renderGroupsListKeyboard(data.groups) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "groups:create" && sessions) {
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_group" });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: "📁 新建分组\n\n请输入分组名称，例如：西班牙、日本备用、洛杉矶主力。\n\n规则：1-32 字，支持中文、英文、数字、空格、下划线、短横线。",
      reply_markup: renderCheckinInlineKeyboard()
    });
  }

  const groupDetailMatch = update.data.match(/^groups:detail:(\d+)$/);
  if (groupDetailMatch && env?.DB) {
    try {
      const data = await new GroupService(env).getGroup(Number(groupDetailMatch[1]));
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupDetailText(data.group), reply_markup: renderGroupDetailKeyboard(data.group) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const groupRenameMatch = update.data.match(/^groups:rename:(\d+)$/);
  if (groupRenameMatch && sessions) {
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "renaming_group", data: { group_id: Number(groupRenameMatch[1]) } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "📁 重命名分组\n\n请输入新的分组名称。", reply_markup: renderCheckinInlineKeyboard() });
  }

  const groupDeleteConfirmMatch = update.data.match(/^groups:delete_confirm:(\d+)$/);
  if (groupDeleteConfirmMatch && env?.DB) {
    try {
      const data = await new GroupService(env).getGroup(Number(groupDeleteConfirmMatch[1]));
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupDeleteConfirmText(data.group), reply_markup: renderGroupDeleteConfirmKeyboard(data.group) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const groupDeleteMatch = update.data.match(/^groups:delete:(\d+)$/);
  if (groupDeleteMatch && env?.DB) {
    try {
      const data = await new GroupService(env).deleteGroup(Number(groupDeleteMatch[1]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: [`✅ 分组已删除`, "", `分组：${data.group.name}`].join("\n"), reply_markup: renderCheckinInlineKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const groupAccountsMatch = update.data.match(/^groups:accounts:(\d+)$/);
  if (groupAccountsMatch && env?.DB) {
    try {
      const group = (await new GroupService(env).getGroup(Number(groupAccountsMatch[1]))).group;
      const accounts = await new AccountService(env).listAccountsByGroup(group.id, requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupAccountsText(group, accounts), reply_markup: renderGroupAccountsKeyboard(group) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const groupInstancesMatch = update.data.match(/^groups:instances:(\d+)$/);
  if (groupInstancesMatch && env?.DB) {
    try {
      const group = (await new GroupService(env).getGroup(Number(groupInstancesMatch[1]))).group;
      const data = await new InstanceService(env).listGroupInstances(group.id, requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderGroupInstancesText(group, data.accounts), reply_markup: renderGroupInstancesKeyboard(group, data.accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "accounts:list" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountListText(accounts), reply_markup: renderAccountListKeyboard(accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "accounts:add" && sessions) {
    return await startAddAccountFlow(update, client, sessions, env);
  }

  const accountAddGroupMatch = update.data.match(/^accounts:add:group:(\d+)$/);
  if (accountAddGroupMatch && sessions && env?.DB) {
    const current = await sessions.getCurrentSession(update.fromId);
    const data = current?.data_json ? JSON.parse(current.data_json) as { alias?: unknown } : {};
    if (typeof data.alias !== "string") {
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "请先输入账号昵称，再选择分组。", reply_markup: renderCheckinInlineKeyboard() });
    }
    const groups = await new GroupService(env).listGroups();
    const groupId = Number(accountAddGroupMatch[1]);
    const group = groups.groups.find((item) => item.id === groupId);
    if (!group) return renderTelegramCallbackError(update, client, new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", requestId, 404), requestId);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias: data.alias, group_id: groupId } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `分组已选择：${group.name}\n账号：${data.alias}\n\n请发送 Linode API Token。`, reply_markup: renderCheckinInlineKeyboard() });
  }

  if (update.data === "accounts:add:group_create" && sessions && env?.DB) {
    const current = await sessions.getCurrentSession(update.fromId);
    const data = current?.data_json ? JSON.parse(current.data_json) as { alias?: unknown } : {};
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_group_from_account", data });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "📁 新建分组\n\n请输入分组名称。创建后会继续添加账号。", reply_markup: renderCheckinInlineKeyboard() });
  }

  const accountDetailMatch = update.data.match(/^accounts:detail:(\d+)$/);
  if (accountDetailMatch && env?.DB) {
    try {
      const account = await new AccountService(env).getAccount(Number(accountDetailMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountDetailText(account), reply_markup: renderAccountDetailKeyboard(account) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountUpdateTokenMatch = update.data.match(/^accounts:update_token:(\d+)$/);
  if (accountUpdateTokenMatch && sessions && env?.DB) {
    try {
      const account = await new AccountService(env).getAccount(Number(accountUpdateTokenMatch[1]), requestId);
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "updating_account_token", data: { account_id: account.id } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: [`👤 更新账号 Token`, "", `账号：#${account.id} ${account.alias}`, "", "请发送新的 Linode API Token。", "Bot 会尝试删除你的 Token 消息，不会在回复中回显 Token。", "更新成功后会重新建立安全基线，历史登录不通知。"].join("\n"), reply_markup: renderCheckinInlineKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountTestMatch = update.data.match(/^accounts:test:(\d+)$/);
  if (accountTestMatch && env?.DB) {
    try {
      const account = await new AccountService(env).testAccount(Number(accountTestMatch[1]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountActionResultText("✅ Token 测试完成", account), reply_markup: renderAccountDetailKeyboard(account) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountDeleteConfirmMatch = update.data.match(/^accounts:delete_confirm:(\d+)$/);
  if (accountDeleteConfirmMatch && env?.DB) {
    try {
      const account = await new AccountService(env).getAccount(Number(accountDeleteConfirmMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountDeleteConfirmText(account), reply_markup: renderAccountDeleteConfirmKeyboard(account) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountDeleteMatch = update.data.match(/^accounts:delete:(\d+)$/);
  if (accountDeleteMatch && env?.DB) {
    try {
      const data = await new AccountService(env).deleteAccount(Number(accountDeleteMatch[1]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountActionResultText("🗑 账号已删除", data.account), reply_markup: renderCheckinInlineKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountMoveGroupMatch = update.data.match(/^accounts:move_group:(\d+)$/);
  if (accountMoveGroupMatch && env?.DB) {
    try {
      const account = await new AccountService(env).getAccount(Number(accountMoveGroupMatch[1]), requestId);
      const groups = (await new GroupService(env).listGroups()).groups;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: [`👤 移动账号分组`, "", `账号：#${account.id} ${account.alias}`, "", "请选择目标分组："].join("\n"), reply_markup: { inline_keyboard: [...groups.map((group) => [{ text: group.name, callback_data: `accounts:move_group_to:${account.id}:${group.id}` }]), [{ text: "返回账号详情", callback_data: `accounts:detail:${account.id}` }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] } });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountMoveGroupToMatch = update.data.match(/^accounts:move_group_to:(\d+):(\d+)$/);
  if (accountMoveGroupToMatch && env?.DB) {
    try {
      const accountId = Number(accountMoveGroupToMatch[1]);
      const groupId = Number(accountMoveGroupToMatch[2]);
      await new GroupService(env).moveAccountToGroup(accountId, groupId, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const account = await new AccountService(env).getAccount(accountId, requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAccountActionResultText("✅ 账号分组已更新", account), reply_markup: renderAccountDetailKeyboard(account) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleListText(data.schedules), reply_markup: renderScheduleListKeyboard(data.schedules) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "schedules:create") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateActionText(), reply_markup: renderScheduleCreateActionKeyboard() });
  }

  const scheduleCreateActionMatch = update.data.match(/^schedules:create:action:(boot|shutdown)$/);
  if (scheduleCreateActionMatch) {
    const action = scheduleCreateActionMatch[1] as "boot" | "shutdown";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateScopeText(action), reply_markup: renderScheduleCreateScopeKeyboard(action) });
  }

  const scheduleCreateScopeMatch = update.data.match(/^schedules:create:scope:(boot|shutdown):(all|account|group)$/);
  if (scheduleCreateScopeMatch && env?.DB) {
    try {
      const action = scheduleCreateScopeMatch[1] as "boot" | "shutdown";
      const scope = scheduleCreateScopeMatch[2] as "all" | "account" | "group";
      if (scope === "all") {
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "all"), reply_markup: renderScheduleCreatePresetKeyboard(action, "all") });
      }
      if (scope === "group") {
        const groups = (await new GroupService(env).listGroups()).groups;
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateGroupText(action, groups), reply_markup: renderScheduleCreateGroupKeyboard(action, groups) });
      }
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateAccountText(action, accounts), reply_markup: renderScheduleCreateAccountKeyboard(action, accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleCreateAccountMatch = update.data.match(/^schedules:create:account:(boot|shutdown):(\d+)$/);
  if (scheduleCreateAccountMatch) {
    const action = scheduleCreateAccountMatch[1] as "boot" | "shutdown";
    const accountId = Number(scheduleCreateAccountMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "account", accountId), reply_markup: renderScheduleCreatePresetKeyboard(action, "account", accountId) });
  }

  const scheduleCreateGroupMatch = update.data.match(/^schedules:create:group:(boot|shutdown):(\d+)$/);
  if (scheduleCreateGroupMatch) {
    const action = scheduleCreateGroupMatch[1] as "boot" | "shutdown";
    const groupId = Number(scheduleCreateGroupMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "group", undefined, groupId), reply_markup: renderScheduleCreatePresetKeyboard(action, "group", undefined, groupId) });
  }

  const scheduleCreateCustomMatch = update.data.match(/^schedules:create:custom:(boot|shutdown):(all|account:\d+|group:\d+)$/);
  if (scheduleCreateCustomMatch && sessions) {
    const action = scheduleCreateCustomMatch[1] as "boot" | "shutdown";
    const scopePart = scheduleCreateCustomMatch[2];
    const accountId = scopePart.startsWith("account:") ? Number(scopePart.split(":")[1]) : undefined;
    const groupId = scopePart.startsWith("group:") ? Number(scopePart.split(":")[1]) : undefined;
    const scope = accountId ? "account" : groupId ? "group" : "all";
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_schedule_custom_time", data: { action, scope, account_id: accountId ?? null, group_id: groupId ?? null } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCustomTimePrompt(action, scope, accountId, groupId), reply_markup: renderCheckinInlineKeyboard() });
  }

  const scheduleCreatePresetMatch = update.data.match(/^schedules:create:preset:(boot|shutdown):(all|account:\d+|group:\d+):(daily_0800|daily_2200)$/);
  if (scheduleCreatePresetMatch && env?.DB) {
    try {
      const action = scheduleCreatePresetMatch[1] as "boot" | "shutdown";
      const scopePart = scheduleCreatePresetMatch[2];
      const preset = scheduleCreatePresetMatch[3];
      const hour = preset === "daily_0800" ? "8" : "22";
      const timeLabel = preset === "daily_0800" ? "每天 08:00" : "每天 22:00";
      const accountId = scopePart.startsWith("account:") ? Number(scopePart.split(":")[1]) : null;
      const groupId = scopePart.startsWith("group:") ? Number(scopePart.split(":")[1]) : null;
      const scope = accountId ? "account" : groupId ? "group" : "all";
      const data = await new ScheduleService(env).createSchedule({
        name: `${timeLabel} ${accountId ? `账号 #${accountId} ` : groupId ? `分组 #${groupId} ` : ""}${action === "boot" ? "开机" : "关机"}`,
        action,
        scope,
        account_id: accountId,
        group_id: groupId,
        cron_expr: `0 ${hour} * * *`,
        timezone: env.APP_TIMEZONE ?? "Asia/Shanghai",
        enabled: true
      }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("created", data.schedule), reply_markup: renderScheduleActionResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "schedules:disable_all_confirm" && env?.DB) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleBulkToggleConfirmText(), reply_markup: renderScheduleBulkToggleConfirmKeyboard() });
  }

  if ((update.data === "schedules:disable_all" || update.data === "schedules:enable_all") && env?.DB) {
    try {
      const service = new ScheduleService(env);
      const data = update.data === "schedules:disable_all"
        ? await service.disableAllSchedules({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" })
        : await service.enableAllSchedules({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleBulkToggleResultText(update.data === "schedules:disable_all" ? "disabled_all" : "enabled_all", data.affected), reply_markup: renderScheduleActionResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleToggleMatch = update.data.match(/^schedules:(enable|disable):(\d+)$/);
  if (scheduleToggleMatch && env?.DB) {
    try {
      const service = new ScheduleService(env);
      const id = Number(scheduleToggleMatch[2]);
      const data = scheduleToggleMatch[1] === "enable"
        ? await service.enableSchedule(id, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" })
        : await service.disableSchedule(id, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderScheduleActionResultText(scheduleToggleMatch[1] === "enable" ? "enabled" : "disabled", data.schedule),
        reply_markup: renderScheduleActionResultKeyboard()
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleDeleteConfirmMatch = update.data.match(/^schedules:delete_confirm:(\d+)$/);
  if (scheduleDeleteConfirmMatch && env?.DB) {
    try {
      const schedules = await new ScheduleService(env).listSchedules({ limit: 100, offset: 0 });
      const schedule = schedules.schedules.find((item) => item.id === Number(scheduleDeleteConfirmMatch[1]));
      if (!schedule) return renderTelegramCallbackError(update, client, new AppError(ErrorCode.VALIDATION_ERROR, "Schedule not found", requestId, 404), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleDeleteConfirmText(schedule), reply_markup: renderScheduleDeleteConfirmKeyboard(schedule) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleDeleteMatch = update.data.match(/^schedules:delete:(\d+)$/);
  if (scheduleDeleteMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).deleteSchedule(Number(scheduleDeleteMatch[1]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("deleted", data.schedule), reply_markup: renderScheduleActionResultKeyboard() });
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceCheckinText(data) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:policies" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).listPolicies({ limit: 10, offset: 0 });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePoliciesText(data.policies), reply_markup: renderAdminPresencePoliciesKeyboard(data.policies) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyDetailMatch = update.data.match(/^admin_presence:policy:detail:(\d+)$/);
  if (adminPresencePolicyDetailMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).getPolicy(Number(adminPresencePolicyDetailMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyDetailText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:policy:create" && sessions) {
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_action" });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyCreateText(), reply_markup: renderAdminPresencePolicyCreateKeyboard() });
  }

  const adminPresencePolicyCreateActionMatch = update.data.match(/^admin_presence:policy:create_action:(notify|shutdown_all_instances|delete_all_instances)$/);
  if (adminPresencePolicyCreateActionMatch && sessions) {
    const action = adminPresencePolicyCreateActionMatch[1];
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_scope", data: { action } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: action === "delete_all_instances" ? [renderAdminPresenceDeletePolicyWarning(), "", renderAdminPresencePolicyScopeText(action)].join("\n") : renderAdminPresencePolicyScopeText(action),
      reply_markup: renderAdminPresencePolicyScopeKeyboard(action)
    });
  }

  const adminPresencePolicyCreateScopeMatch = update.data.match(/^admin_presence:policy:create_scope:(notify|shutdown_all_instances|delete_all_instances):(all|account|group)$/);
  if (adminPresencePolicyCreateScopeMatch && sessions && env?.DB) {
    const action = adminPresencePolicyCreateScopeMatch[1];
    const scope = adminPresencePolicyCreateScopeMatch[2];
    if (scope === "all") {
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_remind", data: { action, scope: "all" } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeText(action, "all"), reply_markup: renderAdminPresencePolicyTimeKeyboard(action, "all") });
    }
    if (scope === "account") {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyAccountText(action, accounts), reply_markup: renderAdminPresencePolicyAccountKeyboard(action, accounts) });
    }
    const groups = (await new GroupService(env).listGroups()).groups;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyGroupText(action, groups), reply_markup: renderAdminPresencePolicyGroupKeyboard(action, groups) });
  }

  const adminPresencePolicyCreateAccountMatch = update.data.match(/^admin_presence:policy:create_account:(notify|shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateAccountMatch && sessions) {
    const action = adminPresencePolicyCreateAccountMatch[1];
    const scope = `account:${adminPresencePolicyCreateAccountMatch[2]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_remind", data: { action, scope } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeText(action, scope), reply_markup: renderAdminPresencePolicyTimeKeyboard(action, scope) });
  }

  const adminPresencePolicyCreateGroupMatch = update.data.match(/^admin_presence:policy:create_group:(notify|shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateGroupMatch && sessions) {
    const action = adminPresencePolicyCreateGroupMatch[1];
    const scope = `group:${adminPresencePolicyCreateGroupMatch[2]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_remind", data: { action, scope } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeText(action, scope), reply_markup: renderAdminPresencePolicyTimeKeyboard(action, scope) });
  }

  const adminPresencePolicyCreateRemindMatch = update.data.match(/^admin_presence:policy:create_remind:(notify|shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+):(\d+)$/);
  if (adminPresencePolicyCreateRemindMatch && sessions) {
    const action = adminPresencePolicyCreateRemindMatch[1];
    const scope = adminPresencePolicyCreateRemindMatch[2];
    const remindAfter = Number(adminPresencePolicyCreateRemindMatch[3]);
    if (action === "notify") {
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_name", data: { action, scope, remind_after_minutes: remindAfter, final_after_minutes: remindAfter + 1 } });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderAdminPresencePolicyNamePrompt(action, remindAfter, remindAfter, scope),
        reply_markup: renderCheckinInlineKeyboard()
      });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_final", data: { action, scope, remind_after_minutes: remindAfter } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAdminPresencePolicyFinalTimeText(action, remindAfter, scope),
      reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, scope)
    });
  }

  const adminPresencePolicyCreateFinalMatch = update.data.match(/^admin_presence:policy:create_final:(notify|shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+):(\d+):(\d+)$/);
  if (adminPresencePolicyCreateFinalMatch && sessions) {
    const action = adminPresencePolicyCreateFinalMatch[1];
    const scope = adminPresencePolicyCreateFinalMatch[2];
    const remindAfter = Number(adminPresencePolicyCreateFinalMatch[3]);
    const finalAfter = Number(adminPresencePolicyCreateFinalMatch[4]);
    if (finalAfter <= remindAfter) {
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "最终动作时间必须晚于提醒时间，请重新选择。", reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, scope) });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_name", data: { action, scope, remind_after_minutes: remindAfter, final_after_minutes: finalAfter } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAdminPresencePolicyNamePrompt(action, remindAfter, finalAfter, scope),
      reply_markup: renderCheckinInlineKeyboard()
    });
  }

  const adminPresencePolicyEditMatch = update.data.match(/^admin_presence:policy:edit:(\d+)$/);
  if (adminPresencePolicyEditMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).getPolicy(Number(adminPresencePolicyEditMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyEditText(data.policy), reply_markup: renderAdminPresencePolicyEditKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditNameMatch = update.data.match(/^admin_presence:policy:edit_name:(\d+)$/);
  if (adminPresencePolicyEditNameMatch && sessions) {
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "editing_admin_presence_policy_name", data: { policy_id: Number(adminPresencePolicyEditNameMatch[1]) } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n请输入新的策略名称。", reply_markup: renderCheckinInlineKeyboard() });
  }

  const adminPresencePolicyEditActionMatch = update.data.match(/^admin_presence:policy:edit_action:(\d+)$/);
  if (adminPresencePolicyEditActionMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n请选择新的最终动作。", reply_markup: renderAdminPresencePolicyEditActionKeyboard(Number(adminPresencePolicyEditActionMatch[1])) });
  }

  const adminPresencePolicyEditActionToMatch = update.data.match(/^admin_presence:policy:edit_action_to:(\d+):(notify|shutdown_all_instances|delete_all_instances)$/);
  if (adminPresencePolicyEditActionToMatch && env?.DB) {
    try {
      const action = adminPresencePolicyEditActionToMatch[2];
      const warning = action === "delete_all_instances" ? [renderAdminPresenceDeletePolicyWarning(), ""].join("\n") : "";
      const data = await new AdminPresenceService(env).updatePolicy(Number(adminPresencePolicyEditActionToMatch[1]), { action }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `${warning}${renderAdminPresencePolicyUpdatedText(data.policy)}`, reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditScopeMatch = update.data.match(/^admin_presence:policy:edit_scope:(\d+)$/);
  if (adminPresencePolicyEditScopeMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n请选择新的作用范围。", reply_markup: renderAdminPresencePolicyEditScopeKeyboard(Number(adminPresencePolicyEditScopeMatch[1])) });
  }

  const adminPresencePolicyEditScopeToMatch = update.data.match(/^admin_presence:policy:edit_scope_to:(\d+):(all|account|group)$/);
  if (adminPresencePolicyEditScopeToMatch && env?.DB) {
    const policyId = Number(adminPresencePolicyEditScopeToMatch[1]);
    const scope = adminPresencePolicyEditScopeToMatch[2];
    try {
      if (scope === "all") {
        const data = await new AdminPresenceService(env).updatePolicy(policyId, { scope: "all" }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
      }
      if (scope === "account") {
        const accounts = await new AccountService(env).listAccounts();
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n范围：单账号\n请选择账号：", reply_markup: renderAdminPresencePolicyEditAccountKeyboard(policyId, accounts) });
      }
      const groups = (await new GroupService(env).listGroups()).groups;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n范围：分组\n请选择分组：", reply_markup: renderAdminPresencePolicyEditGroupKeyboard(policyId, groups) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditAccountToMatch = update.data.match(/^admin_presence:policy:edit_account_to:(\d+):(\d+)$/);
  if (adminPresencePolicyEditAccountToMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).updatePolicy(Number(adminPresencePolicyEditAccountToMatch[1]), { scope: "account", account_id: Number(adminPresencePolicyEditAccountToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditGroupToMatch = update.data.match(/^admin_presence:policy:edit_group_to:(\d+):(\d+)$/);
  if (adminPresencePolicyEditGroupToMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).updatePolicy(Number(adminPresencePolicyEditGroupToMatch[1]), { scope: "group", group_id: Number(adminPresencePolicyEditGroupToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditRemindMatch = update.data.match(/^admin_presence:policy:edit_remind:(\d+)$/);
  if (adminPresencePolicyEditRemindMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n请选择新的提醒时间。", reply_markup: renderAdminPresencePolicyEditTimeKeyboard(Number(adminPresencePolicyEditRemindMatch[1]), "remind") });
  }

  const adminPresencePolicyEditRemindToMatch = update.data.match(/^admin_presence:policy:edit_remind_to:(\d+):(\d+)$/);
  if (adminPresencePolicyEditRemindToMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).updatePolicy(Number(adminPresencePolicyEditRemindToMatch[1]), { remind_after_minutes: Number(adminPresencePolicyEditRemindToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditFinalMatch = update.data.match(/^admin_presence:policy:edit_final:(\d+)$/);
  if (adminPresencePolicyEditFinalMatch && env?.DB) {
    try {
      const policy = (await new AdminPresenceService(env).getPolicy(Number(adminPresencePolicyEditFinalMatch[1]), requestId)).policy;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "编辑保活策略\n\n请选择新的最终动作时间。", reply_markup: renderAdminPresencePolicyEditTimeKeyboard(policy.id, "final", policy.remind_after_minutes ?? 0) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyEditFinalToMatch = update.data.match(/^admin_presence:policy:edit_final_to:(\d+):(\d+)$/);
  if (adminPresencePolicyEditFinalToMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).updatePolicy(Number(adminPresencePolicyEditFinalToMatch[1]), { final_after_minutes: Number(adminPresencePolicyEditFinalToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyDeleteConfirmMatch = update.data.match(/^admin_presence:policy:delete_confirm:(\d+)$/);
  if (adminPresencePolicyDeleteConfirmMatch && env?.DB) {
    try {
      const policy = (await new AdminPresenceService(env).listPolicies({ limit: 100, offset: 0 })).policies.find((item) => item.id === Number(adminPresencePolicyDeleteConfirmMatch[1]));
      if (!policy) return renderTelegramCallbackError(update, client, new AppError(ErrorCode.POLICY_NOT_FOUND, "Admin presence policy not found", requestId, 404), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyDeleteConfirmText(policy), reply_markup: renderAdminPresencePolicyDeleteConfirmKeyboard(policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyDeleteMatch = update.data.match(/^admin_presence:policy:delete:(\d+)$/);
  if (adminPresencePolicyDeleteMatch && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).deletePolicy(Number(adminPresencePolicyDeleteMatch[1]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyDeletedText(data.policy), reply_markup: renderCheckinInlineKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const adminPresencePolicyToggleMatch = update.data.match(/^admin_presence:policy:(enable|disable):(\d+)$/);
  if (adminPresencePolicyToggleMatch && env?.DB) {
    try {
      const service = new AdminPresenceService(env);
      const id = Number(adminPresencePolicyToggleMatch[2]);
      const data = adminPresencePolicyToggleMatch[1] === "enable"
        ? await service.enablePolicy(id, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" })
        : await service.disablePolicy(id, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderAdminPresencePolicyActionText(adminPresencePolicyToggleMatch[1] === "enable" ? "enabled" : "disabled", data.policy),
        reply_markup: renderAdminPresencePolicyActionKeyboard(data.policy)
      });
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
        text: renderSecurityEventStatusUpdateText(data.security_event),
        reply_markup: { inline_keyboard: [[{ text: "返回未确认", callback_data: "security:events:open" }], [{ text: "返回安全事件", callback_data: "menu:security" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] }
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

  const batchGroupConfirmMatch = update.data.match(/^batch:group:(boot|shutdown|delete):(\d+)$/);
  if (batchGroupConfirmMatch && env?.DB) {
    try {
      const action = batchGroupConfirmMatch[1] as BatchAction;
      const groupId = Number(batchGroupConfirmMatch[2]);
      const group = (await new GroupService(env).getGroup(groupId)).group;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "group", groupId, groupName: group.name }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "group", groupId }) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchGroupRunMatch = update.data.match(/^batch:group:run:(boot|shutdown|delete):(\d+)$/);
  if (batchGroupRunMatch && env?.DB) {
    try {
      const action = batchGroupRunMatch[1] as BatchAction;
      const data = await new BatchService(env).runGroupBatch(Number(batchGroupRunMatch[2]), action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAccountConfirmMatch = update.data.match(/^batch:account:(boot|shutdown|delete):(\d+)$/);
  if (batchAccountConfirmMatch && env) {
    const action = batchAccountConfirmMatch[1] as BatchAction;
    const accountId = Number(batchAccountConfirmMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "account", accountId }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "account", accountId }) });
  }

  const batchAccountRunMatch = update.data.match(/^batch:account:run:(boot|shutdown|delete):(\d+)$/);
  if (batchAccountRunMatch && env) {
    try {
      const action = batchAccountRunMatch[1] as BatchAction;
      const data = await new BatchService(env).runAccountBatch(Number(batchAccountRunMatch[2]), action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAllConfirmMatch = update.data.match(/^batch:all:(boot|shutdown|delete)$/);
  if (batchAllConfirmMatch && env) {
    const action = batchAllConfirmMatch[1] as BatchAction;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "all" }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "all" }) });
  }

  const batchAllRunMatch = update.data.match(/^batch:all:run:(boot|shutdown|delete)$/);
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
        reply_markup: renderInstancesListKeyboard(data.accounts, "all")
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const statusListMatch = update.data.match(/^instances:list:status:(running|offline)$/);
  if (statusListMatch && env) {
    try {
      const data = await new InstanceService(env).listAllActiveAccountInstances(requestId);
      const filtered = data.accounts.map((result) => ({
        ...result,
        instances: result.instances.filter((instance) => instance.status === statusListMatch[1])
      }));
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderAllInstancesText(filtered),
        reply_markup: renderInstancesListKeyboard(filtered, "all")
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

  if (update.data === "instances:groups" && env?.DB) {
    try {
      const groups = (await new GroupService(env).listGroups()).groups;
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceGroupsText(groups),
        reply_markup: renderInstanceGroupsKeyboard(groups)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const groupListMatch = update.data.match(/^instances:list:group:(\d+)$/);
  if (groupListMatch && env?.DB) {
    try {
      const groupId = Number(groupListMatch[1]);
      const groupService = new GroupService(env);
      const group = (await groupService.getGroup(groupId)).group;
      const data = await new InstanceService(env).listGroupInstances(groupId, requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: ["按分组查看服务器", "", `分组：${group.name}`, "", ...data.accounts.map((result) => renderAccountInstanceBlock(result.account.alias, result.account.group_name, result.instances))].join("\n"),
        reply_markup: renderInstancesListKeyboard(data.accounts, "group", undefined, group.id)
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
        reply_markup: renderInstancesListKeyboard([data], "account", data.account.id)
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

  const confirmDeleteMatch = update.data.match(/^instances:confirm_delete:(\d+):(\d+)$/);
  if (confirmDeleteMatch && env) {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: ["⚠️ 确认删除服务器？", "", `账号：#${confirmDeleteMatch[1]}`, `服务器 ID：${confirmDeleteMatch[2]}`, "", "删除后通常无法恢复。请确认这是你要执行的操作。"].join("\n"),
      reply_markup: {
        inline_keyboard: [
          [{ text: "确认删除", callback_data: `instances:delete:${confirmDeleteMatch[1]}:${confirmDeleteMatch[2]}` }],
          [{ text: "取消", callback_data: `instances:detail:${confirmDeleteMatch[1]}:${confirmDeleteMatch[2]}` }]
        ]
      }
    });
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
        reply_markup: renderInstanceDetailKeyboard(data)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  return client.editMessage({
    chat_id: update.chatId,
    message_id: update.messageId,
    text: `暂不支持的菜单入口：${update.data}\n后续阶段会通过聊天框下方的固定按钮逐步接入。`,
    reply_markup: renderCheckinInlineKeyboard()
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
    reply_markup: renderCheckinInlineKeyboard()
  });
}
