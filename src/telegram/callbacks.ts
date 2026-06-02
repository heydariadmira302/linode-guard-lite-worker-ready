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
import { WindowsInstanceService } from "../services/windows-instance-service";
import { ScheduleService } from "../services/schedule-service";
import { DiagnosticsService } from "../services/setup-service";
import { JobRunnerService } from "../services/job-runner-service";
import { SecurityService } from "../services/security-service";
import { SecuritySettingsService } from "../services/security-settings-service";
import { AppSettingsService } from "../services/app-settings-service";
import { StatusOverviewService } from "../services/status-overview-service";
import { WindowsInstallRepository } from "../storage/windows-install-repository";
import { AuditRepository } from "../storage/audit-repository";
import type { ParsedTelegramUpdate, TelegramClientResult } from "./types";
import { acquireActionCooldown, renderActionCooldownText, type ActionCooldownResult } from "./action-cooldown";
import { renderTelegramOperationResult } from "./result-template";
import { encodePolicyAction, encodePolicyScope, expandCompactCallbackData } from "./callback-codec";
import { renderAdminPresenceCheckinKeyboard, renderAdminPresenceCheckinText, renderAdminPresenceGlobalActionKeyboard, renderAdminPresenceGlobalActionText, renderAdminPresenceGlobalFinalKeyboard, renderAdminPresenceGlobalFinalText, renderAdminPresenceGlobalScopeKeyboard, renderAdminPresenceGlobalScopeText, renderAdminPresenceGlobalWarnKeyboard, renderAdminPresenceGlobalWarnText, renderAdminPresencePanelKeyboard, renderAdminPresencePanelText, renderAdminPresenceDeletePolicyWarning, renderAdminPresenceMenuKeyboard, renderAdminPresenceMenuText, renderAdminPresencePoliciesKeyboard, renderAdminPresencePoliciesText, renderAdminPresencePolicyAccountKeyboard, renderAdminPresencePolicyAccountText, renderAdminPresencePolicyActionKeyboard, renderAdminPresencePolicyActionText, renderAdminPresencePolicyCreateKeyboard, renderAdminPresencePolicyCreateText, renderAdminPresencePolicyDeleteConfirmKeyboard, renderAdminPresencePolicyDeleteConfirmText, renderAdminPresencePolicyDeletedKeyboard, renderAdminPresencePolicyDeletedText, renderAdminPresencePolicyDetailKeyboard, renderAdminPresencePolicyDetailText, renderAdminPresencePolicyEditAccountKeyboard, renderAdminPresencePolicyEditActionKeyboard, renderAdminPresencePolicyEditGroupKeyboard, renderAdminPresencePolicyEditKeyboard, renderAdminPresencePolicyEditScopeKeyboard, renderAdminPresencePolicyEditText, renderAdminPresencePolicyEditTimeKeyboard, renderAdminPresencePolicyFinalActionKeyboard, renderAdminPresencePolicyFinalActionText, renderAdminPresencePolicyFinalTimeKeyboard, renderAdminPresencePolicyFinalTimeText, renderAdminPresencePolicyGroupKeyboard, renderAdminPresencePolicyGroupText, renderAdminPresencePolicyHourlyReminderKeyboard, renderAdminPresencePolicyHourlyReminderText, renderAdminPresencePolicyNamePrompt, renderAdminPresencePolicyNamePromptKeyboard, renderAdminPresencePolicyScopeKeyboard, renderAdminPresencePolicyScopeText, renderAdminPresencePolicyTimeHourKeyboard, renderAdminPresencePolicyTimeHourText, renderAdminPresencePolicyTimeKeyboard, renderAdminPresencePolicyTimeMinuteKeyboard, renderAdminPresencePolicyTimeMinuteText, renderAdminPresencePolicyTimeText, renderAdminPresencePolicyUpdatedText } from "./admin-presence-renderer";
import { renderAuditLogsKeyboard, renderAuditLogsText } from "./audit-renderer";
import { renderBatchAccountsKeyboard, renderBatchAccountsText, renderBatchConfirmKeyboard, renderBatchConfirmText, renderBatchDeleteArmedKeyboard, renderBatchDeleteArmedText, renderBatchDeleteMenuKeyboard, renderBatchDeleteMenuText, renderBatchGroupsKeyboard, renderBatchGroupsText, renderBatchMenuKeyboard, renderBatchMenuText, renderBatchResultKeyboard, renderBatchResultText, renderBatchScopeActionKeyboard, renderBatchScopeActionText } from "./batch-renderer";
import { renderScheduleActionResultKeyboard, renderScheduleActionResultText, renderScheduleBulkToggleConfirmKeyboard, renderScheduleBulkToggleConfirmText, renderScheduleBulkToggleResultText, renderScheduleCreateAccountKeyboard, renderScheduleCreateAccountText, renderScheduleCreateActionKeyboard, renderScheduleCreateActionText, renderScheduleCreateGroupKeyboard, renderScheduleCreateGroupText, renderScheduleCreateInstanceAccountKeyboard, renderScheduleCreateInstanceAccountText, renderScheduleCreateInstanceKeyboard, renderScheduleCreateInstanceText, renderScheduleCreateHourKeyboard, renderScheduleCreateHourText, renderScheduleCreateMinuteKeyboard, renderScheduleCreateMinuteText, renderScheduleCreatePresetKeyboard, renderScheduleCreatePresetText, renderScheduleCreateScopeKeyboard, renderScheduleCreateScopeText, renderScheduleDetailKeyboard, renderScheduleDetailText, renderScheduleEditActionKeyboard, renderScheduleEditHourKeyboard, renderScheduleEditKeyboard, renderScheduleEditMinuteKeyboard, renderScheduleEditScopeKeyboard, renderScheduleEditText, renderScheduleEditTimeKeyboard, renderScheduleCustomTimePrompt, renderScheduleCustomTimePromptKeyboard, renderScheduleDeleteConfirmKeyboard, renderScheduleDeleteConfirmText, renderScheduleListKeyboard, renderScheduleListText, renderSchedulesMenuKeyboard, renderSchedulesMenuText } from "./schedule-renderer";
import { renderSecurityCheckResultKeyboard, renderSecurityCheckResultText, renderSecurityEventStatusUpdateText, renderSecurityEventsKeyboard, renderSecurityEventsText, renderSecurityMenuKeyboard, renderSecurityMenuText } from "./security-renderer";
import { renderProtectionAccountKeyboard, renderProtectionAccountText, renderProtectionBlockedText, renderProtectionInstanceKeyboard, renderProtectionInstanceText, renderProtectionMenuKeyboard, renderProtectionMenuText, renderProtectionUpdatedText } from "./protection-renderer";
import { renderSecuritySettingsKeyboard, renderSecuritySettingsText, renderSecurityTokenAccountsKeyboard, renderSecurityTokenAccountsText, renderSecurityTokenConfirmKeyboard, renderSecurityTokenConfirmText, renderSecurityTokenGeneratedKeyboard, renderSecurityTokenGeneratedText } from "./security-settings-renderer";
import { renderStatusOverviewKeyboard, renderStatusOverviewText } from "./status-overview-renderer";
import { renderCheckinInlineKeyboard } from "./keyboards";
import { renderWindowsInstallStatusKeyboard, renderWindowsInstallStatusText } from "./windows-install-renderer";
import { renderAccountActionResultText, renderAccountDeleteConfirmKeyboard, renderAccountDeleteConfirmText, renderAccountDetailKeyboard, renderAccountDetailText, renderAccountListKeyboard, renderAccountListText, renderAccountsMenuKeyboard, renderAccountsMenuText, renderDiagnosticsMenuKeyboard, renderDiagnosticsMenuText, renderMainMenuKeyboard, renderMainMenuText, renderMoreMenuKeyboard, renderMoreMenuText, renderMyIdKeyboard, renderMyIdText, renderPrivacyCleanupResultText, renderPrivacyMenuKeyboard, renderPrivacyMenuText, renderSettingsMenuKeyboard, renderSettingsMenuText } from "./menus";
import { GroupService } from "../services/group-service";
import { renderGroupAccountsKeyboard, renderGroupAccountsText, renderGroupDeleteConfirmKeyboard, renderGroupDeleteConfirmText, renderGroupDetailKeyboard, renderGroupDetailText, renderGroupInstancesKeyboard, renderGroupInstancesText, renderGroupsListKeyboard, renderGroupsMenuKeyboard, renderGroupsMenuText } from "./group-renderer";
import { renderAddAccountAliasKeyboard, renderAddAccountAliasPrompt, startAddAccountFlow } from "./account-flow";
import {
  renderAccountInstanceBlock,
  renderAccountInstancesText,
  renderCreatedInstanceText,
  renderWindowsCreatedText,
  renderWindowsCredentialModeKeyboard,
  renderWindowsUsernameModeKeyboard,
  renderWindowsUsernameModeText,
  renderWindowsAdminFallbackKeyboard,
  renderWindowsAdminFallbackText,
  renderWindowsUsernamePromptKeyboard,
  renderWindowsUsernamePromptText,
  renderWindowsCredentialModeText,
  renderWindowsPasswordPromptKeyboard,
  renderWindowsPasswordPromptText,
  renderWindowsLabelModeKeyboard,
  renderWindowsLabelModeText,
  renderWindowsLabelPromptKeyboard,
  renderWindowsLabelPromptText,
  renderWindowsLanguageKeyboard,
  renderWindowsLanguageText,
  renderWindowsVersionKeyboard,
  renderWindowsVersionText,
  renderWindowsCreateConfirmKeyboard,
  renderWindowsCreateConfirmText,
  renderWindowsCreateFirewallText,
  renderWindowsCreateTypeText,
  renderCreateConfirmKeyboard,
  renderCreateConfirmText,
  renderCreateFirewallKeyboard,
  renderCreateFirewallText,
  renderCreateImageKeyboard,
  renderCreateImageText,
  renderCreateInstanceAccountKeyboard,
  renderCreateInstanceAccountText,
  renderCreateRegionKeyboard,
  renderCreateRegionText,
  renderCreateTypeKeyboard,
  renderCreateTypeText,
  renderAllInstancesText,
  renderInstanceAccountsKeyboard,
  renderInstanceAccountsText,
  renderInstanceDetailKeyboard,
  renderInstanceDetailText,
  renderInstanceFilterKeyboard,
  renderInstanceFilterText,
  renderInstanceGroupsKeyboard,
  renderInstanceGroupsText,
  renderInstanceDangerKeyboard,
  renderInstanceDangerText,
  renderInstancesListKeyboard,
  renderInstancesMenuKeyboard,
  renderInstancesMenuText
} from "./instance-renderer";

export async function routeTelegramCallback(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  sessions?: Pick<BotSessionService, "getCurrentSession" | "setCurrentSession" | "clearCurrentSession">,
  env?: Env,
  requestId = "req_telegram"
): Promise<TelegramClientResult> {
  update = { ...update, data: expandCompactCallbackData(update.data) };

  if (update.data === "menu:myid") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderMyIdText({ userId: update.fromId, username: update.fromUsername, firstName: update.fromFirstName, lastName: update.fromLastName, languageCode: update.fromLanguageCode, chatId: update.chatId }), reply_markup: renderMyIdKeyboard({ userId: update.fromId, username: update.fromUsername, chatId: update.chatId }) });
  }

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

  if (update.data === "status:overview") {
    if (!env?.DB) {
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "状态总览需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    try {
      const data = await new StatusOverviewService(env).getOverview(requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderStatusOverviewText(data, env.APP_TIMEZONE), reply_markup: renderStatusOverviewKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "menu:more") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderMoreMenuText(),
      reply_markup: renderMoreMenuKeyboard()
    });
  }

  if (update.data === "menu:privacy" && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).getSettings();
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderPrivacyMenuText(settings),
        reply_markup: renderPrivacyMenuKeyboard(settings)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const privacyAutoDeleteMatch = update.data.match(/^privacy:auto_delete:(off|1|5|15|60|1440)$/);
  if (privacyAutoDeleteMatch && env?.DB) {
    try {
      const minutes = privacyAutoDeleteMatch[1] === "off" ? 0 : Number(privacyAutoDeleteMatch[1]);
      const settings = await new AppSettingsService(env).updateSettings({ telegram_auto_delete_minutes: minutes });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderPrivacyMenuText(settings),
        reply_markup: renderPrivacyMenuKeyboard(settings)
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "privacy:cleanup_now" && env?.DB) {
    try {
      const result = await new JobRunnerService(env).cleanupTelegramMessagesNow(new Date(), { exclude: [{ chatId: update.chatId, messageId: update.messageId }] });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderPrivacyCleanupResultText(result),
        reply_markup: renderPrivacyMenuKeyboard(await new AppSettingsService(env).getSettings())
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderTelegramOperationResult({ title: "分组已删除", status: "success", requestId, fields: [{ label: "分组", value: data.group.name }], nextStep: "返回分组列表确认结果" }), reply_markup: renderCheckinInlineKeyboard() });
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

  if (update.data === "accounts:add:cancel" && sessions) {
    await sessions.clearCurrentSession(update.fromId);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "已取消添加账号。", reply_markup: renderAccountsMenuKeyboard() });
  }

  const accountAddBackAliasMatch = update.data.match(/^accounts:add:back_alias(?::(\d+))?$/);
  if (accountAddBackAliasMatch && sessions) {
    const groupId = accountAddBackAliasMatch[1] ? Number(accountAddBackAliasMatch[1]) : undefined;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_alias", data: groupId ? { preset_group_id: groupId } : undefined });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAddAccountAliasPrompt(groupId), reply_markup: renderAddAccountAliasKeyboard(groupId) });
  }

  const accountAddToGroupMatch = update.data.match(/^accounts:add:to_group:(\d+)$/);
  if (accountAddToGroupMatch && sessions && env?.DB) {
    const groupId = Number(accountAddToGroupMatch[1]);
    try {
      await new GroupService(env).getGroup(groupId);
      return await startAddAccountFlow(update, client, sessions, env, groupId);
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountAddGroupMatch = update.data.match(/^accounts:add:group:(\d+)$/);
  if (accountAddGroupMatch && sessions && env?.DB) {
    const current = await sessions.getCurrentSession(update.fromId);
    const data = current?.data_json ? JSON.parse(current.data_json) as { alias?: unknown } : {};
    if (typeof data.alias !== "string") {
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "请先输入账号昵称。普通添加账号会自动进入未分组；如需指定分组，请从分组详情里点击“添加账号到本组”。", reply_markup: renderCheckinInlineKeyboard() });
    }
    const groups = await new GroupService(env).listGroups();
    const groupId = Number(accountAddGroupMatch[1]);
    const group = groups.groups.find((item) => item.id === groupId);
    if (!group) return renderTelegramCallbackError(update, client, new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", requestId, 404), requestId);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_token", data: { alias: data.alias, group_id: groupId } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `分组已选择：${group.name}\n账号：${data.alias}\n\n请发送 Linode API Token。`, reply_markup: renderCheckinInlineKeyboard() });
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: [`👤 更新账号 Token`, "", `账号：#${account.id} ${account.alias}`, "", "请发送新的 Linode API Token。", "Bot 会尝试删除你的 Token 消息，不会在回复中回显 Token。", "更新成功后会重新建立安全基线，历史登录不通知。", "", "不想继续可以点下方按钮，或发送 /cancel。"].join("\n"), reply_markup: { inline_keyboard: [[{ text: "取消更新", callback_data: `accounts:update_token:cancel:${account.id}` }], [{ text: "返回账号详情", callback_data: `accounts:detail:${account.id}` }]] } });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const accountUpdateTokenCancelMatch = update.data.match(/^accounts:update_token:cancel:(\d+)$/);
  if (accountUpdateTokenCancelMatch && sessions && env?.DB) {
    try {
      await sessions.clearCurrentSession(update.fromId);
      const account = await new AccountService(env).getAccount(Number(accountUpdateTokenCancelMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "已取消更新 Token。", reply_markup: renderAccountDetailKeyboard(account) });
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: [`👤 移动账号分组`, "", `账号：#${account.id} ${account.alias}`, "", "请选择目标分组："].join("\n"), reply_markup: { inline_keyboard: [...groups.map((group) => [{ text: group.name, callback_data: `accounts:move_group_to:${account.id}:${group.id}` }]), [{ text: "返回账号详情", callback_data: `accounts:detail:${account.id}` }], [{ text: "返回账号管理", callback_data: "menu:accounts" }]] } });
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
    return client.sendMessage({
      chat_id: update.chatId,
      text: renderInstancesMenuText(),
      reply_markup: renderInstancesMenuKeyboard()
    });
  }

  if (update.data === "instances:filter") {
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderInstanceFilterText(),
      reply_markup: renderInstanceFilterKeyboard()
    });
  }

  if ((update.data === "menu:audit_logs" || update.data === "audit_logs:all:0") && env?.DB) {
    const view = { limit: 5, offset: 0 };
    const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs(view);
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAuditLogsText(data.audit_logs, env.APP_TIMEZONE, view),
      reply_markup: renderAuditLogsKeyboard(view)
    });
  }

  const auditLogsAllMatch = update.data.match(/^audit_logs:all:(\d+)$/);
  if (auditLogsAllMatch && env?.DB) {
    const view = { limit: 5, offset: Number(auditLogsAllMatch[1]) };
    const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs(view);
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAuditLogsText(data.audit_logs, env.APP_TIMEZONE, view),
      reply_markup: renderAuditLogsKeyboard(view)
    });
  }

  const auditLogsFilterMatch = update.data.match(/^audit_logs:(risk|result|target):([A-Za-z0-9_]+):(\d+)$/);
  if (auditLogsFilterMatch && env?.DB) {
    const kind = auditLogsFilterMatch[1];
    const value = auditLogsFilterMatch[2];
    const view = {
      limit: 5,
      offset: Number(auditLogsFilterMatch[3]),
      risk_level: kind === "risk" ? value : undefined,
      result: kind === "result" ? value : undefined,
      target_type: kind === "target" ? value : undefined
    };
    const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs(view);
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAuditLogsText(data.audit_logs, env.APP_TIMEZONE, view),
      reply_markup: renderAuditLogsKeyboard(view)
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

  const batchScopeMenuMatch = update.data.match(/^batch:scope:(account|group|all)$/);
  if (batchScopeMenuMatch) {
    const scope = batchScopeMenuMatch[1] as "account" | "group" | "all";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchScopeActionText(scope), reply_markup: renderBatchScopeActionKeyboard(scope) });
  }

  if (update.data === "batch:delete_menu") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchDeleteMenuText(), reply_markup: renderBatchDeleteMenuKeyboard() });
  }

  if (update.data === "menu:diagnostics" && env) {
    try {
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderDiagnosticsMenuText(deployment.status, jobs.missing, jobs.disabled, {
          failedChecks: Object.entries(deployment.checks).filter(([, check]) => !check.ok).map(([name]) => name),
          bootSafetyMode: deployment.boot_safety?.mode,
          botManagedOfflineCount: deployment.boot_safety?.bot_managed_offline_count
        }),
        reply_markup: renderDiagnosticsMenuKeyboard()
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "menu:settings") {
    const settings = env?.DB ? await new AppSettingsService(env).getSettings() : undefined;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSettingsMenuText(settings), reply_markup: renderSettingsMenuKeyboard(settings) });
  }

  const dangerCooldownMatch = update.data.match(/^settings:danger_cooldown:(on|off)$/);
  if (dangerCooldownMatch && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).updateSettings({ dangerous_action_cooldown_enabled: dangerCooldownMatch[1] === "on" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSettingsMenuText(settings), reply_markup: renderSettingsMenuKeyboard(settings) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
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

  const scheduleDetailMatch = update.data.match(/^schedules:detail:(\d+)$/);
  if (scheduleDetailMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).getSchedule(Number(scheduleDetailMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleDetailText(data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleEditMatch = update.data.match(/^schedules:edit:(\d+)$/);
  if (scheduleEditMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).getSchedule(Number(scheduleEditMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleEditText(data.schedule), reply_markup: renderScheduleEditKeyboard(data.schedule) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleEditActionMenuMatch = update.data.match(/^schedules:edit_action:(\d+)$/);
  if (scheduleEditActionMenuMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "✏️ 修改定时任务动作\n\n请选择新的动作：", reply_markup: renderScheduleEditActionKeyboard(Number(scheduleEditActionMenuMatch[1])) });
  }

  const scheduleEditScopeMenuMatch = update.data.match(/^schedules:edit_scope:(\d+)$/);
  if (scheduleEditScopeMenuMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "✏️ 修改定时任务范围\n\n请选择新的作用范围：", reply_markup: renderScheduleEditScopeKeyboard(Number(scheduleEditScopeMenuMatch[1])) });
  }

  const scheduleEditTimeMenuMatch = update.data.match(/^schedules:edit_time:(\d+)$/);
  if (scheduleEditTimeMenuMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).getSchedule(Number(scheduleEditTimeMenuMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "✏️ 修改执行时间\n\n请选择新的执行时间：", reply_markup: renderScheduleEditTimeKeyboard(data.schedule) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "schedules:create") {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateActionText(), reply_markup: renderScheduleCreateActionKeyboard() });
  }

  const scheduleEditActionMatch = update.data.match(/^schedules:edit_action_to:(\d+):(boot|shutdown|reboot)$/);
  if (scheduleEditActionMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditActionMatch[1]), { action: scheduleEditActionMatch[2] }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditScopeToMatch = update.data.match(/^schedules:edit_scope_to:(\d+):(all|account|group|instance)$/);
  if (scheduleEditScopeToMatch && env?.DB) {
    try {
      const scheduleId = Number(scheduleEditScopeToMatch[1]);
      const scope = scheduleEditScopeToMatch[2];
      if (scope === "all") {
        const data = await new ScheduleService(env).updateSchedule(scheduleId, { scope: "all" }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
      }
      const current = await new ScheduleService(env).getSchedule(scheduleId, requestId);
      const action = current.schedule.action as "boot" | "shutdown" | "reboot";
      if (scope === "group") {
        const groups = (await new GroupService(env).listGroups()).groups;
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateGroupText(action, groups), reply_markup: { inline_keyboard: [
          ...groups.slice(0, 10).map((group) => [{ text: `📁 ${group.name}`, callback_data: `schedules:edit_group_to:${scheduleId}:${group.id}` }]),
          [{ text: "⬅️ 返回选择范围", callback_data: `schedules:edit_scope:${scheduleId}` }]
        ] } });
      }
      const accounts = await new AccountService(env).listAccounts();
      if (scope === "account") return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateAccountText(action, accounts), reply_markup: { inline_keyboard: [
        ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `schedules:edit_account_to:${scheduleId}:${account.id}` }]),
        [{ text: "⬅️ 返回选择范围", callback_data: `schedules:edit_scope:${scheduleId}` }]
      ] } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateInstanceAccountText(action, accounts), reply_markup: { inline_keyboard: [
        ...accounts.slice(0, 10).map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `schedules:edit_instance_account:${scheduleId}:${account.id}` }]),
        [{ text: "⬅️ 返回选择范围", callback_data: `schedules:edit_scope:${scheduleId}` }]
      ] } });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditAccountToMatch = update.data.match(/^schedules:edit_account_to:(\d+):(\d+)$/);
  if (scheduleEditAccountToMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditAccountToMatch[1]), { scope: "account", account_id: Number(scheduleEditAccountToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditGroupToMatch = update.data.match(/^schedules:edit_group_to:(\d+):(\d+)$/);
  if (scheduleEditGroupToMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditGroupToMatch[1]), { scope: "group", group_id: Number(scheduleEditGroupToMatch[2]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditInstanceAccountMatch = update.data.match(/^schedules:edit_instance_account:(\d+):(\d+)$/);
  if (scheduleEditInstanceAccountMatch && env?.DB) {
    try {
      const scheduleId = Number(scheduleEditInstanceAccountMatch[1]);
      const accountId = Number(scheduleEditInstanceAccountMatch[2]);
      const current = await new ScheduleService(env).getSchedule(scheduleId, requestId);
      const data = await new InstanceService(env).listAccountInstances(accountId, requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateInstanceText(current.schedule.action, data.account, data.instances), reply_markup: { inline_keyboard: [
        ...data.instances.slice(0, 10).map((instance) => [{ text: `#${instance.id} ${instance.label}`, callback_data: `schedules:edit_instance_to:${scheduleId}:${accountId}:${instance.id}` }]),
        [{ text: "⬅️ 返回选择账号", callback_data: `sc:es:${scheduleId}:i` }]
      ] } });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditInstanceToMatch = update.data.match(/^schedules:edit_instance_to:(\d+):(\d+):(\d+)$/);
  if (scheduleEditInstanceToMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditInstanceToMatch[1]), { scope: "instance", account_id: Number(scheduleEditInstanceToMatch[2]), instance_id: Number(scheduleEditInstanceToMatch[3]) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditPresetMatch = update.data.match(/^schedules:edit_preset:(\d+):daily_(0850|2305)$/);
  if (scheduleEditPresetMatch && env?.DB) {
    try {
      const hour = scheduleEditPresetMatch[2] === "0850" ? "8" : "23";
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditPresetMatch[1]), { cron_expr: `${scheduleEditPresetMatch[2] === "0850" ? 50 : 5} ${hour} * * *` }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleEditHourMatch = update.data.match(/^schedules:edit_hour:(\d+)$/);
  if (scheduleEditHourMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "✏️ 修改执行时间\n\n请选择小时：", reply_markup: renderScheduleEditHourKeyboard(Number(scheduleEditHourMatch[1])) });
  }

  const scheduleEditMinuteMatch = update.data.match(/^schedules:edit_minute:(\d+):(\d{2})$/);
  if (scheduleEditMinuteMatch) {
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `✏️ 修改执行时间\n\n已选小时：${scheduleEditMinuteMatch[2]}:__\n请选择分钟：`, reply_markup: renderScheduleEditMinuteKeyboard(Number(scheduleEditMinuteMatch[1]), scheduleEditMinuteMatch[2]) });
  }

  const scheduleEditSelectedTimeMatch = update.data.match(/^schedules:edit_selected_time:(\d+):(\d{2}):(\d{2})$/);
  if (scheduleEditSelectedTimeMatch && env?.DB) {
    try {
      const data = await new ScheduleService(env).updateSchedule(Number(scheduleEditSelectedTimeMatch[1]), { cron_expr: `${Number(scheduleEditSelectedTimeMatch[3])} ${Number(scheduleEditSelectedTimeMatch[2])} * * *` }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("updated", data.schedule), reply_markup: renderScheduleDetailKeyboard(data.schedule) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const scheduleCreateActionMatch = update.data.match(/^schedules:create:action:(boot|shutdown|reboot)$/);
  if (scheduleCreateActionMatch) {
    const action = scheduleCreateActionMatch[1] as "boot" | "shutdown" | "reboot";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateScopeText(action), reply_markup: renderScheduleCreateScopeKeyboard(action) });
  }

  const scheduleCreateScopeMatch = update.data.match(/^schedules:create:scope:(boot|shutdown|reboot):(all|account|group|instance)$/);
  if (scheduleCreateScopeMatch && env?.DB) {
    try {
      const action = scheduleCreateScopeMatch[1] as "boot" | "shutdown" | "reboot";
      const scope = scheduleCreateScopeMatch[2] as "all" | "account" | "group" | "instance";
      if (scope === "all") {
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "all"), reply_markup: renderScheduleCreatePresetKeyboard(action, "all") });
      }
      if (scope === "group") {
        const groups = (await new GroupService(env).listGroups()).groups;
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateGroupText(action, groups), reply_markup: renderScheduleCreateGroupKeyboard(action, groups) });
      }
      const accounts = await new AccountService(env).listAccounts();
      if (scope === "instance") return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateInstanceAccountText(action, accounts), reply_markup: renderScheduleCreateInstanceAccountKeyboard(action, accounts) });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateAccountText(action, accounts), reply_markup: renderScheduleCreateAccountKeyboard(action, accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleCreateAccountMatch = update.data.match(/^schedules:create:account:(boot|shutdown|reboot):(\d+)$/);
  if (scheduleCreateAccountMatch) {
    const action = scheduleCreateAccountMatch[1] as "boot" | "shutdown" | "reboot";
    const accountId = Number(scheduleCreateAccountMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "account", accountId), reply_markup: renderScheduleCreatePresetKeyboard(action, "account", accountId) });
  }

  const scheduleCreateGroupMatch = update.data.match(/^schedules:create:group:(boot|shutdown|reboot):(\d+)$/);
  if (scheduleCreateGroupMatch) {
    const action = scheduleCreateGroupMatch[1] as "boot" | "shutdown" | "reboot";
    const groupId = Number(scheduleCreateGroupMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "group", undefined, groupId), reply_markup: renderScheduleCreatePresetKeyboard(action, "group", undefined, groupId) });
  }

  const scheduleCreateInstanceAccountMatch = update.data.match(/^schedules:create:instance_account:(boot|shutdown|reboot):(\d+)$/);
  if (scheduleCreateInstanceAccountMatch && env?.DB) {
    try {
      const action = scheduleCreateInstanceAccountMatch[1] as "boot" | "shutdown" | "reboot";
      const accountId = Number(scheduleCreateInstanceAccountMatch[2]);
      const data = await new InstanceService(env).listAccountInstances(accountId, requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateInstanceText(action, data.account, data.instances), reply_markup: renderScheduleCreateInstanceKeyboard(action, data) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleCreateInstanceMatch = update.data.match(/^schedules:create:instance:(boot|shutdown|reboot):(\d+):(\d+)$/);
  if (scheduleCreateInstanceMatch) {
    const action = scheduleCreateInstanceMatch[1] as "boot" | "shutdown" | "reboot";
    const accountId = Number(scheduleCreateInstanceMatch[2]);
    const instanceId = Number(scheduleCreateInstanceMatch[3]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, "instance", accountId, undefined, instanceId), reply_markup: renderScheduleCreatePresetKeyboard(action, "instance", accountId, undefined, instanceId) });
  }

  const scheduleCreateTimeBackMatch = update.data.match(/^schedules:create:time:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+)$/);
  if (scheduleCreateTimeBackMatch) {
    const action = scheduleCreateTimeBackMatch[1] as "boot" | "shutdown" | "reboot";
    const scopePart = scheduleCreateTimeBackMatch[2];
    const parts = scopePart.split(":");
    const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : undefined;
    const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : undefined;
    const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : undefined;
    const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreatePresetText(action, scope, accountId, groupId, instanceId), reply_markup: renderScheduleCreatePresetKeyboard(action, scope, accountId, groupId, instanceId) });
  }

  const scheduleCreateHourMatch = update.data.match(/^schedules:create:hour:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+)$/);
  if (scheduleCreateHourMatch) {
    const action = scheduleCreateHourMatch[1] as "boot" | "shutdown" | "reboot";
    const scopePart = scheduleCreateHourMatch[2];
    const parts = scopePart.split(":");
    const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : undefined;
    const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : undefined;
    const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : undefined;
    const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateHourText(action, scope, accountId, groupId, instanceId), reply_markup: renderScheduleCreateHourKeyboard(action, scope, accountId, groupId, instanceId) });
  }

  const scheduleCreateMinuteMatch = update.data.match(/^schedules:create:minute:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+):(\d{2})$/);
  if (scheduleCreateMinuteMatch) {
    const action = scheduleCreateMinuteMatch[1] as "boot" | "shutdown" | "reboot";
    const scopePart = scheduleCreateMinuteMatch[2];
    const hour = scheduleCreateMinuteMatch[3];
    const parts = scopePart.split(":");
    const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : undefined;
    const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : undefined;
    const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : undefined;
    const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCreateMinuteText(action, scope, hour, accountId, groupId, instanceId), reply_markup: renderScheduleCreateMinuteKeyboard(action, scope, hour, accountId, groupId, instanceId) });
  }

  const scheduleCreateSelectedTimeMatch = update.data.match(/^schedules:create:selected_time:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+):(\d{2}):(\d{2})$/);
  if (scheduleCreateSelectedTimeMatch && env?.DB) {
    try {
      const action = scheduleCreateSelectedTimeMatch[1] as "boot" | "shutdown" | "reboot";
      const scopePart = scheduleCreateSelectedTimeMatch[2];
      const hour = scheduleCreateSelectedTimeMatch[3];
      const minute = scheduleCreateSelectedTimeMatch[4];
      const parts = scopePart.split(":");
      const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : null;
      const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : null;
      const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : null;
      const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
      const timeLabel = `每天 ${hour}:${minute}`;
      const data = await new ScheduleService(env).createSchedule({
        name: `${timeLabel} ${instanceId ? `实例 #${instanceId} ` : accountId ? `账号 #${accountId} ` : groupId ? `分组 #${groupId} ` : ""}${action === "boot" ? "开机" : action === "shutdown" ? "关机" : "重启"}`,
        action,
        scope,
        account_id: accountId,
        group_id: groupId,
        instance_id: instanceId,
        cron_expr: `${Number(minute)} ${Number(hour)} * * *`,
        timezone: env.APP_TIMEZONE ?? "Asia/Shanghai",
        enabled: true
      }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleActionResultText("created", data.schedule), reply_markup: renderScheduleActionResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const scheduleCreateCustomMatch = update.data.match(/^schedules:create:custom:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+)$/);
  if (scheduleCreateCustomMatch && sessions) {
    const action = scheduleCreateCustomMatch[1] as "boot" | "shutdown" | "reboot";
    const scopePart = scheduleCreateCustomMatch[2];
    const parts = scopePart.split(":");
    const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : undefined;
    const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : undefined;
    const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : undefined;
    const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_schedule_custom_time", data: { action, scope, account_id: accountId ?? null, group_id: groupId ?? null, instance_id: instanceId ?? null } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderScheduleCustomTimePrompt(action, scope, accountId, groupId, instanceId), reply_markup: renderScheduleCustomTimePromptKeyboard(action, scope, accountId, groupId, instanceId) });
  }

  const scheduleCreatePresetMatch = update.data.match(/^schedules:create:preset:(boot|shutdown|reboot):(all|account:\d+|group:\d+|instance:\d+:\d+):(daily_0850|daily_2305)$/);
  if (scheduleCreatePresetMatch && env?.DB) {
    try {
      const action = scheduleCreatePresetMatch[1] as "boot" | "shutdown" | "reboot";
      const scopePart = scheduleCreatePresetMatch[2];
      const preset = scheduleCreatePresetMatch[3];
      const hour = preset === "daily_0850" ? "8" : "23";
      const timeLabel = preset === "daily_0850" ? "每天 08:50" : "每天 23:05";
      const parts = scopePart.split(":");
      const accountId = scopePart.startsWith("account:") || scopePart.startsWith("instance:") ? Number(parts[1]) : null;
      const groupId = scopePart.startsWith("group:") ? Number(parts[1]) : null;
      const instanceId = scopePart.startsWith("instance:") ? Number(parts[2]) : null;
      const scope = instanceId ? "instance" : accountId ? "account" : groupId ? "group" : "all";
      const data = await new ScheduleService(env).createSchedule({
        name: `${timeLabel} ${instanceId ? `实例 #${instanceId} ` : accountId ? `账号 #${accountId} ` : groupId ? `分组 #${groupId} ` : ""}${action === "boot" ? "开机" : action === "shutdown" ? "关机" : "重启"}`,
        action,
        scope,
        account_id: accountId,
        group_id: groupId,
        instance_id: instanceId,
        cron_expr: `${preset === "daily_0850" ? 50 : 5} ${hour} * * *`,
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
      const service = new AdminPresenceService(env);
      const [status, list] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = list.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }


  if (update.data === "admin_presence:global:enable" && env?.DB) {
    try {
      const service = new AdminPresenceService(env);
      const list = await service.listPolicies({ limit: 1, offset: 0 });
      if (list.policies[0]) await service.enablePolicy(list.policies[0].id, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      else await service.createPolicy({ name: "全局保活风控", scope: "all", action: "notify", remind_after_minutes: 12 * 60, final_after_minutes: 24 * 60, enabled: true }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const [status, refreshed] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = refreshed.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:global:warn" && env?.DB) {
    const policy = (await new AdminPresenceService(env).listPolicies({ limit: 1, offset: 0 })).policies[0] ?? null;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceGlobalWarnText(policy), reply_markup: renderAdminPresenceGlobalWarnKeyboard() });
  }

  const adminPresenceGlobalWarnToMatch = update.data.match(/^admin_presence:global:warn_to:(\d+)$/);
  if (adminPresenceGlobalWarnToMatch && env?.DB) {
    try {
      const minutes = Number(adminPresenceGlobalWarnToMatch[1]);
      const service = new AdminPresenceService(env);
      const list = await service.listPolicies({ limit: 1, offset: 0 });
      const current = list.policies[0];
      const finalAfter = Math.max(current?.final_after_minutes ?? 24 * 60, minutes + 60);
      if (current) await service.updatePolicy(current.id, { remind_after_minutes: minutes, final_after_minutes: finalAfter }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      else await service.createPolicy({ name: "全局保活风控", scope: "all", action: "notify", remind_after_minutes: minutes, final_after_minutes: finalAfter, enabled: true }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const [status, refreshed] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = refreshed.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "admin_presence:global:final" && env?.DB) {
    const policy = (await new AdminPresenceService(env).listPolicies({ limit: 1, offset: 0 })).policies[0] ?? null;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceGlobalFinalText(policy), reply_markup: renderAdminPresenceGlobalFinalKeyboard(policy?.remind_after_minutes ?? 0) });
  }

  const adminPresenceGlobalFinalToMatch = update.data.match(/^admin_presence:global:final_to:(\d+)$/);
  if (adminPresenceGlobalFinalToMatch && env?.DB) {
    try {
      const minutes = Number(adminPresenceGlobalFinalToMatch[1]);
      const service = new AdminPresenceService(env);
      const list = await service.listPolicies({ limit: 1, offset: 0 });
      const current = list.policies[0];
      if (current) await service.updatePolicy(current.id, { final_after_minutes: minutes }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      else await service.createPolicy({ name: "全局保活风控", scope: "all", action: "notify", remind_after_minutes: 12 * 60, final_after_minutes: minutes, enabled: true }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const [status, refreshed] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = refreshed.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "admin_presence:global:action" && env?.DB) {
    const policy = (await new AdminPresenceService(env).listPolicies({ limit: 1, offset: 0 })).policies[0] ?? null;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceGlobalActionText(policy), reply_markup: renderAdminPresenceGlobalActionKeyboard() });
  }

  const adminPresenceGlobalActionToMatch = update.data.match(/^admin_presence:global:action_to:(notify|shutdown_all_instances|delete_all_instances)$/);
  if (adminPresenceGlobalActionToMatch && env?.DB) {
    try {
      const action = adminPresenceGlobalActionToMatch[1];
      const service = new AdminPresenceService(env);
      const list = await service.listPolicies({ limit: 1, offset: 0 });
      const current = list.policies[0];
      if (current) await service.updatePolicy(current.id, { action }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      else await service.createPolicy({ name: "全局保活风控", scope: "all", action, remind_after_minutes: 12 * 60, final_after_minutes: 24 * 60, enabled: true }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const [status, refreshed] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = refreshed.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "admin_presence:global:scope" && env?.DB) {
    const policy = (await new AdminPresenceService(env).listPolicies({ limit: 1, offset: 0 })).policies[0] ?? null;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresenceGlobalScopeText(policy), reply_markup: renderAdminPresenceGlobalScopeKeyboard() });
  }

  const adminPresenceGlobalScopeToMatch = update.data.match(/^admin_presence:global:scope_to:(all)$/);
  if (adminPresenceGlobalScopeToMatch && env?.DB) {
    try {
      const service = new AdminPresenceService(env);
      const list = await service.listPolicies({ limit: 1, offset: 0 });
      const current = list.policies[0];
      if (current) await service.updatePolicy(current.id, { scope: "all" }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      else await service.createPolicy({ name: "全局保活风控", scope: "all", action: "notify", remind_after_minutes: 12 * 60, final_after_minutes: 24 * 60, enabled: true }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const [status, refreshed] = await Promise.all([service.getStatus(), service.listPolicies({ limit: 1, offset: 0 })]);
      const policy = refreshed.policies[0] ?? null;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePanelText({ ...status, primary_policy: policy }), reply_markup: renderAdminPresencePanelKeyboard(policy) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "admin_presence:checkin" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).checkin({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions?.clearCurrentSession?.(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresenceCheckinText(data), reply_markup: renderAdminPresenceCheckinKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "admin_presence:policies" && env?.DB) {
    try {
      const data = await new AdminPresenceService(env).listPolicies({ limit: 10, offset: 0 });
      return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresencePoliciesText(data.policies), reply_markup: renderAdminPresencePoliciesKeyboard(data.policies) });
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

  const adminPresencePolicyCreateFirstRemindMatch = update.data.match(/^admin_presence:policy:create_remind:pending:all:(\d+)$/);
  if (adminPresencePolicyCreateFirstRemindMatch && sessions) {
    const remindAfter = Number(adminPresencePolicyCreateFirstRemindMatch[1]);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_action", data: { remind_after_minutes: remindAfter } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAdminPresencePolicyFinalActionText(remindAfter),
      reply_markup: renderAdminPresencePolicyFinalActionKeyboard(remindAfter)
    });
  }

  const adminPresencePolicyCreateActionAfterRemindMatch = update.data.match(/^admin_presence:policy:create_action_after_remind:(\d+):(notify|shutdown_all_instances|delete_all_instances)$/);
  if (adminPresencePolicyCreateActionAfterRemindMatch && sessions) {
    const remindAfter = Number(adminPresencePolicyCreateActionAfterRemindMatch[1]);
    const action = adminPresencePolicyCreateActionAfterRemindMatch[2];
    if (action === "notify") {
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_name", data: { action, scope: "all", remind_after_minutes: remindAfter, final_after_minutes: remindAfter } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyNamePrompt(action, remindAfter, remindAfter, "all"), reply_markup: renderAdminPresencePolicyNamePromptKeyboard() });
    }
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_scope", data: { action, remind_after_minutes: remindAfter } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: action === "delete_all_instances" ? [renderAdminPresenceDeletePolicyWarning(), "", renderAdminPresencePolicyScopeText(action, remindAfter)].join("\n") : renderAdminPresencePolicyScopeText(action, remindAfter),
      reply_markup: renderAdminPresencePolicyScopeKeyboard(action, remindAfter)
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

  const adminPresencePolicyCreateScopeAfterRemindMatch = update.data.match(/^admin_presence:policy:create_scope_after_remind:(\d+):(shutdown_all_instances|delete_all_instances):(all|account|group)$/);
  if (adminPresencePolicyCreateScopeAfterRemindMatch && sessions && env?.DB) {
    const remindAfter = Number(adminPresencePolicyCreateScopeAfterRemindMatch[1]);
    const action = adminPresencePolicyCreateScopeAfterRemindMatch[2];
    const scope = adminPresencePolicyCreateScopeAfterRemindMatch[3];
    if (scope === "all") {
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_final", data: { action, scope: "all", remind_after_minutes: remindAfter } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyFinalTimeText(action, remindAfter, "all"), reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, "all") });
    }
    if (scope === "account") {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyAccountText(action, accounts), reply_markup: renderAdminPresencePolicyAccountKeyboard(action, accounts, remindAfter) });
    }
    const groups = (await new GroupService(env).listGroups()).groups;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyGroupText(action, groups), reply_markup: renderAdminPresencePolicyGroupKeyboard(action, groups, remindAfter) });
  }

  const adminPresencePolicyCreateAccountMatch = update.data.match(/^admin_presence:policy:create_account:(notify|shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateAccountMatch && sessions) {
    const action = adminPresencePolicyCreateAccountMatch[1];
    const scope = `account:${adminPresencePolicyCreateAccountMatch[2]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_remind", data: { action, scope } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeText(action, scope), reply_markup: renderAdminPresencePolicyTimeKeyboard(action, scope) });
  }

  const adminPresencePolicyCreateAccountAfterRemindMatch = update.data.match(/^admin_presence:policy:create_account_after_remind:(\d+):(shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateAccountAfterRemindMatch && sessions) {
    const remindAfter = Number(adminPresencePolicyCreateAccountAfterRemindMatch[1]);
    const action = adminPresencePolicyCreateAccountAfterRemindMatch[2];
    const scope = `account:${adminPresencePolicyCreateAccountAfterRemindMatch[3]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_final", data: { action, scope, remind_after_minutes: remindAfter } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyFinalTimeText(action, remindAfter, scope), reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, scope) });
  }

  const adminPresencePolicyCreateGroupMatch = update.data.match(/^admin_presence:policy:create_group:(notify|shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateGroupMatch && sessions) {
    const action = adminPresencePolicyCreateGroupMatch[1];
    const scope = `group:${adminPresencePolicyCreateGroupMatch[2]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_remind", data: { action, scope } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeText(action, scope), reply_markup: renderAdminPresencePolicyTimeKeyboard(action, scope) });
  }

  const adminPresencePolicyCreateGroupAfterRemindMatch = update.data.match(/^admin_presence:policy:create_group_after_remind:(\d+):(shutdown_all_instances|delete_all_instances):(\d+)$/);
  if (adminPresencePolicyCreateGroupAfterRemindMatch && sessions) {
    const remindAfter = Number(adminPresencePolicyCreateGroupAfterRemindMatch[1]);
    const action = adminPresencePolicyCreateGroupAfterRemindMatch[2];
    const scope = `group:${adminPresencePolicyCreateGroupAfterRemindMatch[3]}`;
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_final", data: { action, scope, remind_after_minutes: remindAfter } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyFinalTimeText(action, remindAfter, scope), reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, scope) });
  }

  const adminPresencePolicyCreateTimeHourMatch = update.data.match(/^admin_presence:policy:create_time_hour:(remind|final):(pending|notify|shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+)(?::(\d+))?$/);
  if (adminPresencePolicyCreateTimeHourMatch && sessions) {
    const field = adminPresencePolicyCreateTimeHourMatch[1] as "remind" | "final";
    const action = adminPresencePolicyCreateTimeHourMatch[2];
    const scope = adminPresencePolicyCreateTimeHourMatch[3];
    const remindAfter = Number(adminPresencePolicyCreateTimeHourMatch[4] ?? 0);
    const prefix = `ap:ctm:${field === "remind" ? "r" : "f"}:${encodePolicyAction(action)}:${encodePolicyScope(scope)}${field === "final" ? `:${remindAfter}` : ""}`;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeHourText(field, remindAfter), reply_markup: renderAdminPresencePolicyTimeHourKeyboard(prefix, remindAfter) });
  }

  const adminPresencePolicyCreateTimeMinuteMatch = update.data.match(/^admin_presence:policy:create_time_minute:(remind|final):(pending|notify|shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+)(?::(\d+))?:(\d+)$/);
  if (adminPresencePolicyCreateTimeMinuteMatch && sessions) {
    const field = adminPresencePolicyCreateTimeMinuteMatch[1] as "remind" | "final";
    const action = adminPresencePolicyCreateTimeMinuteMatch[2];
    const scope = adminPresencePolicyCreateTimeMinuteMatch[3];
    const remindAfter = Number(adminPresencePolicyCreateTimeMinuteMatch[4] ?? 0);
    const hour = Number(adminPresencePolicyCreateTimeMinuteMatch[5]);
    const prefix = `ap:ct:${field === "remind" ? "r" : "f"}:${encodePolicyAction(action)}:${encodePolicyScope(scope)}${field === "final" ? `:${remindAfter}` : ""}`;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeMinuteText(field, hour, remindAfter), reply_markup: renderAdminPresencePolicyTimeMinuteKeyboard(prefix, hour, remindAfter) });
  }

  const adminPresencePolicyCreateTimeMatch = update.data.match(/^admin_presence:policy:create_time:(remind|final):(pending|notify|shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+)(?::(\d+))?:(\d+):(\d+)$/);
  if (adminPresencePolicyCreateTimeMatch && sessions) {
    const field = adminPresencePolicyCreateTimeMatch[1] as "remind" | "final";
    const action = adminPresencePolicyCreateTimeMatch[2];
    const scope = adminPresencePolicyCreateTimeMatch[3];
    const remindAfter = Number(adminPresencePolicyCreateTimeMatch[4] ?? 0);
    const minutes = Number(adminPresencePolicyCreateTimeMatch[5]) * 60 + Number(adminPresencePolicyCreateTimeMatch[6]);
    if (field === "remind") {
      if (action === "pending") {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_action", data: { remind_after_minutes: minutes } });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyFinalActionText(minutes), reply_markup: renderAdminPresencePolicyFinalActionKeyboard(minutes) });
      }
      if (action === "notify") {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_name", data: { action, scope, remind_after_minutes: minutes, final_after_minutes: minutes } });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyNamePrompt(action, minutes, minutes, scope), reply_markup: renderAdminPresencePolicyNamePromptKeyboard() });
      }
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_final", data: { action, scope, remind_after_minutes: minutes } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyFinalTimeText(action, minutes, scope), reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, minutes, scope) });
    }
    if (minutes <= remindAfter) return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: "最终动作时间必须晚于第一段提醒时间，请重新选择。", reply_markup: renderAdminPresencePolicyFinalTimeKeyboard(action, remindAfter, scope) });
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_hourly", data: { action, scope, remind_after_minutes: remindAfter, final_after_minutes: minutes } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyHourlyReminderText(action, remindAfter, minutes, scope), reply_markup: renderAdminPresencePolicyHourlyReminderKeyboard(action, scope, remindAfter, minutes) });
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
        reply_markup: renderAdminPresencePolicyNamePromptKeyboard()
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
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_hourly", data: { action, scope, remind_after_minutes: remindAfter, final_after_minutes: finalAfter } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAdminPresencePolicyHourlyReminderText(action, remindAfter, finalAfter, scope),
      reply_markup: renderAdminPresencePolicyHourlyReminderKeyboard(action, scope, remindAfter, finalAfter)
    });
  }

  const adminPresencePolicyCreateHourlyMatch = update.data.match(/^admin_presence:policy:create_hourly:(shutdown_all_instances|delete_all_instances):(all|account:\d+|group:\d+):(\d+):(\d+):(\d+)$/);
  if (adminPresencePolicyCreateHourlyMatch && sessions) {
    const action = adminPresencePolicyCreateHourlyMatch[1];
    const scope = adminPresencePolicyCreateHourlyMatch[2];
    const remindAfter = Number(adminPresencePolicyCreateHourlyMatch[3]);
    const finalAfter = Number(adminPresencePolicyCreateHourlyMatch[4]);
    const hourlyBefore = Number(adminPresencePolicyCreateHourlyMatch[5]);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_admin_presence_policy_name", data: { action, scope, remind_after_minutes: remindAfter, final_after_minutes: finalAfter, hourly_reminder_before_minutes: hourlyBefore } });
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: renderAdminPresencePolicyNamePrompt(action, remindAfter, finalAfter, scope, hourlyBefore),
      reply_markup: renderAdminPresencePolicyNamePromptKeyboard()
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

  const adminPresencePolicyEditTimeHourMatch = update.data.match(/^admin_presence:policy:edit_time_hour:(remind|final):(\d+)$/);
  if (adminPresencePolicyEditTimeHourMatch && env?.DB) {
    const field = adminPresencePolicyEditTimeHourMatch[1] as "remind" | "final";
    const policyId = Number(adminPresencePolicyEditTimeHourMatch[2]);
    const policy = (await new AdminPresenceService(env).getPolicy(policyId, requestId)).policy;
    const minMinutes = field === "final" ? policy.remind_after_minutes ?? 0 : 0;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeHourText(field, minMinutes), reply_markup: renderAdminPresencePolicyTimeHourKeyboard(`ap:etm:${field === "remind" ? "r" : "f"}:${policyId}`, minMinutes) });
  }

  const adminPresencePolicyEditTimeMinuteMatch = update.data.match(/^admin_presence:policy:edit_time_minute:(remind|final):(\d+):(\d+)$/);
  if (adminPresencePolicyEditTimeMinuteMatch && env?.DB) {
    const field = adminPresencePolicyEditTimeMinuteMatch[1] as "remind" | "final";
    const policyId = Number(adminPresencePolicyEditTimeMinuteMatch[2]);
    const hour = Number(adminPresencePolicyEditTimeMinuteMatch[3]);
    const policy = (await new AdminPresenceService(env).getPolicy(policyId, requestId)).policy;
    const minMinutes = field === "final" ? policy.remind_after_minutes ?? 0 : 0;
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyTimeMinuteText(field, hour, minMinutes), reply_markup: renderAdminPresencePolicyTimeMinuteKeyboard(`ap:etc:${field === "remind" ? "r" : "f"}:${policyId}`, hour, minMinutes) });
  }

  const adminPresencePolicyEditTimeMatch = update.data.match(/^admin_presence:policy:edit_time:(remind|final):(\d+):(\d+):(\d+)$/);
  if (adminPresencePolicyEditTimeMatch && env?.DB) {
    const field = adminPresencePolicyEditTimeMatch[1] as "remind" | "final";
    const policyId = Number(adminPresencePolicyEditTimeMatch[2]);
    const minutes = Number(adminPresencePolicyEditTimeMatch[3]) * 60 + Number(adminPresencePolicyEditTimeMatch[4]);
    try {
      const data = await new AdminPresenceService(env).updatePolicy(policyId, field === "remind" ? { remind_after_minutes: minutes } : { final_after_minutes: minutes }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
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
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderAdminPresencePolicyDeletedText(data.policy), reply_markup: renderAdminPresencePolicyDeletedKeyboard() });
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

  if (update.data === "protect:menu" && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).getSettings();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionMenuText(settings.protected_instances), reply_markup: renderProtectionMenuKeyboard(settings.protected_instances) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "protect:add" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionAccountText(accounts), reply_markup: renderProtectionAccountKeyboard(accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const protectAccountMatch = update.data.match(/^protect:account:(\d+)$/);
  if (protectAccountMatch && env?.DB) {
    try {
      const data = await new InstanceService(env).listAccountInstances(Number(protectAccountMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionInstanceText(data), reply_markup: renderProtectionInstanceKeyboard(data) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const protectAddInstanceMatch = update.data.match(/^protect:add_instance:(\d+):(\d+)$/);
  if (protectAddInstanceMatch && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).addProtectedInstance({ account_id: Number(protectAddInstanceMatch[1]), instance_id: Number(protectAddInstanceMatch[2]) });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionUpdatedText(settings.protected_instances), reply_markup: renderProtectionMenuKeyboard(settings.protected_instances) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const protectRemoveConfirmMatch = update.data.match(/^protect:remove_confirm:(\d+)$/);
  if (protectRemoveConfirmMatch && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).getSettings();
      const index = Number(protectRemoveConfirmMatch[1]);
      const rule = settings.protected_instances[index];
      if (!rule) throw new AppError(ErrorCode.VALIDATION_ERROR, "Protected instance rule not found", requestId, 404);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: ["⚠️ 确认移除保护实例？", "", `规则：${index + 1}. ${rule.account_id ? `账号 #${rule.account_id}` : ""}${rule.instance_id ? ` / 实例 #${rule.instance_id}` : ""}${rule.label ? ` / Label：${rule.label}` : ""}`, "", "移除后，该实例将不再被批量关机 / 批量删除 / 保活最终动作自动跳过。"].join("\n"),
        reply_markup: { inline_keyboard: [[{ text: "确认移除保护", callback_data: `protect:remove:${index}` }], [{ text: "取消", callback_data: "protect:menu" }]] }
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const protectRemoveMatch = update.data.match(/^protect:remove:(\d+)$/);
  if (protectRemoveMatch && env?.DB) {
    try {
      const settings = await new AppSettingsService(env).removeProtectedInstance(Number(protectRemoveMatch[1]));
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionUpdatedText(settings.protected_instances), reply_markup: renderProtectionMenuKeyboard(settings.protected_instances) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "security:settings" && env?.DB) {
    try {
      const settings = await new SecuritySettingsService(env).getSettings();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecuritySettingsText(settings), reply_markup: renderSecuritySettingsKeyboard(settings) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const securitySettingsToggleMatch = update.data.match(/^security:settings:(auto_token|ip_geo|night):(on|off)$/);
  if (securitySettingsToggleMatch && env?.DB) {
    try {
      const key = securitySettingsToggleMatch[1] === "auto_token" ? "auto_generate_linode_token_enabled" : securitySettingsToggleMatch[1] === "ip_geo" ? "ip_geo_enabled" : "night_login_enabled";
      const settings = await new SecuritySettingsService(env).updateSettings({ [key]: securitySettingsToggleMatch[2] === "on" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecuritySettingsText(settings), reply_markup: renderSecuritySettingsKeyboard(settings) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  if (update.data === "security:token:accounts" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecurityTokenAccountsText(accounts), reply_markup: renderSecurityTokenAccountsKeyboard(accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const securityTokenConfirmMatch = update.data.match(/^security:token:confirm:(\d+)$/);
  if (securityTokenConfirmMatch && env?.DB) {
    try {
      const account = await new AccountService(env).getAccount(Number(securityTokenConfirmMatch[1]), requestId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecurityTokenConfirmText(account), reply_markup: renderSecurityTokenConfirmKeyboard(account) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const securityTokenGenerateMatch = update.data.match(/^security:token:generate:(\d+)$/);
  if (securityTokenGenerateMatch && env?.DB) {
    try {
      const data = await new SecurityService(env).generateReplacementLinodeToken(Number(securityTokenGenerateMatch[1]), {}, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderSecurityTokenGeneratedText(data), reply_markup: renderSecurityTokenGeneratedKeyboard() });
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
        reply_markup: { inline_keyboard: [[{ text: "返回未确认", callback_data: "security:events:open" }], [{ text: "返回安全事件", callback_data: "menu:security" }]] }
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

  const batchGroupsMatch = update.data.match(/^batch:groups:(boot|shutdown|delete)$/);
  if (batchGroupsMatch && env?.DB) {
    try {
      const action = batchGroupsMatch[1] as BatchAction;
      const groups = (await new GroupService(env).listGroups()).groups;
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchGroupsText(action, groups), reply_markup: renderBatchGroupsKeyboard(groups, action) });
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
      const estimate = action === "boot" ? { protected_count: 0 } : await new AppSettingsService(env).estimateProtectedMatches({ group_id: groupId });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "group", groupId, groupName: group.name, protectedCount: estimate.protected_count }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "group", groupId }) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchGroupArmDeleteMatch = update.data.match(/^batch:group:arm_delete:(\d+)$/);
  if (batchGroupArmDeleteMatch && env?.DB && sessions) {
    const groupId = Number(batchGroupArmDeleteMatch[1]);
    const group = (await new GroupService(env).getGroup(groupId)).group;
    const estimate = await new AppSettingsService(env).estimateProtectedMatches({ group_id: groupId });
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "confirming_batch_delete", data: { scope: "group", group_id: groupId } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchDeleteArmedText({ scope: "group", groupId, groupName: group.name, protectedCount: estimate.protected_count }), reply_markup: renderBatchDeleteArmedKeyboard() });
  }

  const batchGroupRunMatch = update.data.match(/^batch:group:run:(boot|shutdown|delete):(\d+)$/);
  if (batchGroupRunMatch && env?.DB) {
    try {
      const action = batchGroupRunMatch[1] as BatchAction;
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `batch:group:${action}:${batchGroupRunMatch[2]}`, requestId, action);
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new BatchService(env).runGroupBatch(Number(batchGroupRunMatch[2]), action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data, requestId), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAccountConfirmMatch = update.data.match(/^batch:account:(boot|shutdown|delete):(\d+)$/);
  if (batchAccountConfirmMatch && env) {
    const action = batchAccountConfirmMatch[1] as BatchAction;
    const accountId = Number(batchAccountConfirmMatch[2]);
    const estimate = action === "boot" || !env.DB ? { protected_count: 0 } : await new AppSettingsService(env).estimateProtectedMatches({ account_id: accountId });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "account", accountId, protectedCount: estimate.protected_count }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "account", accountId }) });
  }

  const batchAccountArmDeleteMatch = update.data.match(/^batch:account:arm_delete:(\d+)$/);
  if (batchAccountArmDeleteMatch && env?.DB && sessions) {
    const accountId = Number(batchAccountArmDeleteMatch[1]);
    const estimate = await new AppSettingsService(env).estimateProtectedMatches({ account_id: accountId });
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "confirming_batch_delete", data: { scope: "account", account_id: accountId } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchDeleteArmedText({ scope: "account", accountId, protectedCount: estimate.protected_count }), reply_markup: renderBatchDeleteArmedKeyboard() });
  }

  const batchAccountRunMatch = update.data.match(/^batch:account:run:(boot|shutdown|delete):(\d+)$/);
  if (batchAccountRunMatch && env) {
    try {
      const action = batchAccountRunMatch[1] as BatchAction;
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `batch:account:${action}:${batchAccountRunMatch[2]}`, requestId, action);
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new BatchService(env).runAccountBatch(Number(batchAccountRunMatch[2]), action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data, requestId), reply_markup: renderBatchResultKeyboard() });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const batchAllConfirmMatch = update.data.match(/^batch:all:(boot|shutdown|delete)$/);
  if (batchAllConfirmMatch && env) {
    const action = batchAllConfirmMatch[1] as BatchAction;
    const estimate = action === "boot" || !env.DB ? { protected_count: 0 } : await new AppSettingsService(env).estimateProtectedMatches();
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchConfirmText({ action, scope: "all", protectedCount: estimate.protected_count }), reply_markup: renderBatchConfirmKeyboard({ action, scope: "all" }) });
  }

  if (update.data === "batch:all:arm_delete" && env?.DB && sessions) {
    const estimate = await new AppSettingsService(env).estimateProtectedMatches();
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "confirming_batch_delete", data: { scope: "all" } });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchDeleteArmedText({ scope: "all", protectedCount: estimate.protected_count }), reply_markup: renderBatchDeleteArmedKeyboard() });
  }

  const batchAllRunMatch = update.data.match(/^batch:all:run:(boot|shutdown|delete)$/);
  if (batchAllRunMatch && env) {
    try {
      const action = batchAllRunMatch[1] as BatchAction;
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `batch:all:${action}`, requestId, action);
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new BatchService(env).runAllAccountsBatch(action, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderBatchResultText(data, requestId), reply_markup: renderBatchResultKeyboard() });
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
        reply_markup: renderInstancesListKeyboard(filtered, statusListMatch[1] === "running" ? "status_running" : "status_offline")
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




  if (update.data === "windows:install_status" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      const repository = new WindowsInstallRepository(env.DB);
      const all = (await Promise.all(accounts.map((account) => repository.listByAccount(account.id, 10)))).flat().sort((a: any, b: any) => Number(b.id) - Number(a.id)).slice(0, 10);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsInstallStatusText(all), reply_markup: renderWindowsInstallStatusKeyboard() });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "windows:create" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateInstanceAccountText(accounts).replace("➕ 创建服务器", "🪟 创建 Windows 服务器").replace("先选择要用哪个 Linode 账号创建服务器。", "先选择要用哪个 Linode 账号创建 Windows。"), reply_markup: { inline_keyboard: [...accounts.map((account) => [{ text: `👤 #${account.id} ${account.alias}`, callback_data: `windows:create:account:${account.id}` }]), [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]] } });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsAccountMatch = update.data.match(/^windows:create:account:(\d+)$/);
  if (windowsAccountMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsAccountMatch[1]);
      const service = new WindowsInstanceService(env);
      const status = await service.getStatus(accountId, requestId);
      if (!status.configured) {
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `🪟 Windows StackScript 未配置
━━━━━━━━━━━━
账号：#${status.account.id} ${status.account.alias}

需要先在当前 Linode 账号创建私有 StackScript。这个操作只写入 StackScript，不会创建服务器。`, reply_markup: { inline_keyboard: [[{ text: "✅ 创建/更新私有 StackScript", callback_data: `windows:stackscript:ensure:${accountId}` }], [{ text: "❌ 取消", callback_data: "menu:instances" }]] } });
      }
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsVersionText(), reply_markup: renderWindowsVersionKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }


  const windowsVersionMatch = update.data.match(/^windows:create:version:(\d+):(2k22|2k25-cn|2k25-cn-dd|2k25-en|w11-ltsc-2024|w11-cn-dd)$/);
  if (windowsVersionMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsVersionMatch[1]);
      const version = windowsVersionMatch[2];
      if (version === "w11-ltsc-2024") {
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsLanguageText(), reply_markup: renderWindowsLanguageKeyboard(accountId) });
      }
      const lang = version === "2k25-cn" ? "zh-cn" : "en-us";
      const options = await new WindowsInstanceService(env).getCreateOptions(accountId, requestId, { version: version as any, lang: lang as any });
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_instance", data: { account_id: accountId, options, state: { windows_version: version, windows_version_label: options.version.label, windows_lang: lang } } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsCredentialModeText({ windows_version: version, windows_version_label: options.version.label, windows_lang: lang }), reply_markup: renderWindowsCredentialModeKeyboard(accountId, version) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsLangMatch = update.data.match(/^windows:create:lang:(\d+):(zh-cn|en-us)$/);
  if (windowsLangMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsLangMatch[1]);
      const lang = windowsLangMatch[2] as "zh-cn" | "en-us";
      const options = await new WindowsInstanceService(env).getCreateOptions(accountId, requestId, { version: "w11-ltsc-2024", lang });
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_instance", data: { account_id: accountId, options, state: { windows_version: "w11-ltsc-2024", windows_version_label: options.version.label, windows_lang: lang } } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsCredentialModeText({ windows_version: "w11-ltsc-2024", windows_version_label: options.version.label, windows_lang: lang }), reply_markup: renderWindowsCredentialModeKeyboard(accountId, "w11-ltsc-2024") });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }


  const windowsBackCredentialMatch = update.data.match(/^windows:create:back_credential:(\d+)$/);
  if (windowsBackCredentialMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsBackCredentialMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      delete parsed.state.administrator_password;
      delete parsed.state.windows_username;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsCredentialModeText(parsed.state), reply_markup: renderWindowsCredentialModeKeyboard(accountId, String(parsed.state.windows_version ?? "")) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsBackLabelMatch = update.data.match(/^windows:create:back_label:(\d+)$/);
  if (windowsBackLabelMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsBackLabelMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      delete parsed.state.label;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsUsernameModeText(parsed.state), reply_markup: renderWindowsUsernameModeKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsCredMatch = update.data.match(/^windows:create:cred:(\d+):(auto|custom)$/);
  if (windowsCredMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsCredMatch[1]);
      const mode = windowsCredMatch[2];
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      if (mode === "custom") {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_password", data: { account_id: accountId, options: parsed.options, state: parsed.state } });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsPasswordPromptText(), reply_markup: renderWindowsPasswordPromptKeyboard(accountId) });
      }
      delete parsed.state.administrator_password;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsUsernameModeText(parsed.state), reply_markup: renderWindowsUsernameModeKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }



  const windowsBackUsernameMatch = update.data.match(/^windows:create:back_username:(\d+)$/);
  if (windowsBackUsernameMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsBackUsernameMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      delete parsed.state.windows_username;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsUsernameModeText(parsed.state), reply_markup: renderWindowsUsernameModeKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsUserMatch = update.data.match(/^windows:create:user:(\d+):(administrator|custom)$/);
  if (windowsUserMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsUserMatch[1]);
      const mode = windowsUserMatch[2];
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      if (mode === "custom") {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_username", data: { account_id: accountId, options: parsed.options, state: parsed.state } });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsUsernamePromptText(), reply_markup: renderWindowsUsernamePromptKeyboard(accountId) });
      }
      parsed.state.windows_username = "Administrator";
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsAdminFallbackText(parsed.state), reply_markup: renderWindowsAdminFallbackKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsFallbackMatch = update.data.match(/^windows:create:fallback:(\d+):(keep|disable)$/);
  if (windowsFallbackMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsFallbackMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      parsed.state.keep_administrator_fallback = windowsFallbackMatch[2] === "keep";
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsLabelModeText(parsed.state), reply_markup: renderWindowsLabelModeKeyboard(accountId) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsLabelMatch = update.data.match(/^windows:create:label:(\d+):(auto|custom)$/);
  if (windowsLabelMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsLabelMatch[1]);
      const mode = windowsLabelMatch[2];
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      if (mode === "custom") {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_label", data: { account_id: accountId, options: parsed.options, state: parsed.state } });
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsLabelPromptText(), reply_markup: renderWindowsLabelPromptKeyboard(accountId) });
      }
      delete parsed.state.label;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      const text = renderCreateRegionText(parsed.options.regions).replace("➕ 创建 Linux 服务器", "🪟 创建 Windows 服务器") + (parsed.state.windows_version === "w11-ltsc-2024" ? "\n\nBot 会自动查找官方 ISO，不需要你输入 ISO URL。" : parsed.state.windows_version === "2k25-cn" ? "\n\nWindows Server 2025 简体中文版会使用官方 Evaluation ISO 路线。" : parsed.state.windows_version === "2k25-en" ? "\n\nWindows Server 2025 English 会使用官方 Evaluation ISO 路线。" : "");
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text, reply_markup: renderCreateRegionKeyboard(accountId, parsed.options.regions, 0, `windows:create:back_label:${accountId}`, "⬅️ 上一步：命名") });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsEnsureMatch = update.data.match(/^windows:stackscript:ensure:(\d+)$/);
  if (windowsEnsureMatch && env?.DB) {
    try {
      const accountId = Number(windowsEnsureMatch[1]);
      const status = await new WindowsInstanceService(env).ensureStackScript(accountId, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `✅ Windows 私有 StackScript 已就绪
━━━━━━━━━━━━
账号：#${status.account.id} ${status.account.alias}
StackScript ID：${status.stackscript_id}
版本：${status.version_label}`, reply_markup: { inline_keyboard: [[{ text: "继续创建 Windows", callback_data: `windows:create:account:${accountId}` }], [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]] } });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }


  const windowsFixRdpFirewallMatch = update.data.match(/^windows:create:fix_rdp_firewall:(\d+)$/);
  if (windowsFixRdpFirewallMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsFixRdpFirewallMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      const firewallId = Number(parsed.state.firewall_id);
      if (!Number.isInteger(firewallId) || firewallId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "请先选择一个 Linode Firewall", requestId, 400);
      const status = await new WindowsInstanceService(env).fixRdpFirewall(accountId, firewallId, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      parsed.state.rdp_firewall_ok = status.ok;
      parsed.state.rdp_firewall_message = status.message;
      await saveCreateInstanceSession(sessions, update, accountId, parsed);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: `${renderWindowsCreateConfirmText(parsed.options.account, parsed.state)}\n\n${status.ok ? "✅ 已一键放行 TCP 3389。" : "⚠️ 防火墙修复后仍未检测到 3389，请手动检查。"}`, reply_markup: renderWindowsCreateConfirmKeyboard(accountId, parsed.state) });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  const windowsConfirmMatch = update.data.match(/^windows:create:confirm:(\d+)$/);
  if (windowsConfirmMatch && env?.DB && sessions) {
    try {
      const accountId = Number(windowsConfirmMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      const data = await new WindowsInstanceService(env).createWindowsInstance(accountId, { region: String(parsed.state.region), type: String(parsed.state.type), label: typeof parsed.state.label === "string" ? parsed.state.label : undefined, firewall_id: parsed.state.firewall_id === undefined ? null : Number(parsed.state.firewall_id), version: parsed.state.windows_version as any, lang: parsed.state.windows_lang as any, administrator_password: typeof parsed.state.administrator_password === "string" ? parsed.state.administrator_password : undefined, windows_username: typeof parsed.state.windows_username === "string" ? parsed.state.windows_username : undefined, keep_administrator_fallback: typeof parsed.state.keep_administrator_fallback === "boolean" ? parsed.state.keep_administrator_fallback : undefined }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram", telegramChatId: String(update.chatId), telegramUserId: String(update.fromId) });
      await sessions.clearCurrentSession(update.fromId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsCreatedText(data), reply_markup: { inline_keyboard: [[{ text: "🏠 返回主菜单", callback_data: "menu:main" }], [{ text: "↩️ 返回账号服务器", callback_data: `instances:list:account:${data.account.id}` }], [{ text: "🖥 稍后查看服务器详情", callback_data: `instances:detail:${data.account.id}:${data.instance.id}:account_${data.account.id}` }]] } });
    } catch (error) { return renderTelegramCallbackError(update, client, error, requestId); }
  }

  if (update.data === "instances:create" && env?.DB) {
    try {
      const accounts = await new AccountService(env).listAccounts();
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateInstanceAccountText(accounts), reply_markup: renderCreateInstanceAccountKeyboard(accounts) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const createAccountMatch = update.data.match(/^instances:create:account:(\d+)$/);
  if (createAccountMatch && env?.DB && sessions) {
    try {
      const accountId = Number(createAccountMatch[1]);
      const options = await new InstanceService(env).getCreateOptions(accountId, requestId);
      await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_instance", data: { account_id: accountId, options } });
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateRegionText(options.regions), reply_markup: renderCreateRegionKeyboard(accountId, options.regions) });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const createRegionPageMatch = update.data.match(/^instances:create:region_page:(\d+):(\d+)$/);
  if (createRegionPageMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const accountId = Number(createRegionPageMatch[1]);
    const isWindows = Boolean(parsed.options.stackscript);
    const page = Number(createRegionPageMatch[2]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: (isWindows ? renderCreateRegionText(parsed.options.regions, page).replace("➕ 创建 Linux 服务器", "🪟 创建 Windows 服务器") : renderCreateRegionText(parsed.options.regions, page)), reply_markup: renderCreateRegionKeyboard(accountId, parsed.options.regions, page, isWindows ? `windows:create:back_label:${accountId}` : "menu:instances", isWindows ? "⬅️ 上一步：命名" : "❌ 取消") });
  }

  const createRegionMatch = update.data.match(/^instances:create:region:(\d+):(.+)$/);
  if (createRegionMatch && sessions) {
    const accountId = Number(createRegionMatch[1]);
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const region = String(createRegionMatch[2]);
    const selected = parsed.options.regions.find((item: any) => String(item.id) === region);
    parsed.state.region = region;
    parsed.state.region_label = selected?.label ?? region;
    await saveCreateInstanceSession(sessions, update, accountId, parsed);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: parsed.options.stackscript ? renderWindowsCreateTypeText(parsed.state) : renderCreateTypeText(parsed.options.types, parsed.state), reply_markup: renderCreateTypeKeyboard(accountId, parsed.options.types, parsed.state) });
  }

  const createTypePageMatch = update.data.match(/^instances:create:type_page:(\d+):(\d+)$/);
  if (createTypePageMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: parsed.options.stackscript ? renderWindowsCreateTypeText(parsed.state) : renderCreateTypeText(parsed.options.types, parsed.state, Number(createTypePageMatch[2])), reply_markup: renderCreateTypeKeyboard(Number(createTypePageMatch[1]), parsed.options.types, parsed.state, Number(createTypePageMatch[2])) });
  }

  const createTypeMatch = update.data.match(/^instances:create:type:(\d+):(.+)$/);
  if (createTypeMatch && sessions) {
    const accountId = Number(createTypeMatch[1]);
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const type = String(createTypeMatch[2]);
    const selected = parsed.options.types.find((item: any) => String(item.id) === type);
    parsed.state.type = type;
    parsed.state.type_label = selected?.label ?? type;
    await saveCreateInstanceSession(sessions, update, accountId, parsed);
    if (parsed.options.stackscript) return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderWindowsCreateFirewallText(parsed.state), reply_markup: renderCreateFirewallKeyboard(accountId, parsed.options.firewalls, `instances:create:back_type:${accountId}`, "⬅️ 上一步：配置") });
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateImageText(parsed.options.images, parsed.state), reply_markup: renderCreateImageKeyboard(accountId, parsed.options.images) });
  }

  const createImagePageMatch = update.data.match(/^instances:create:image_page:(\d+):(\d+)$/);
  if (createImagePageMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateImageText(parsed.options.images, parsed.state, Number(createImagePageMatch[2])), reply_markup: renderCreateImageKeyboard(Number(createImagePageMatch[1]), parsed.options.images, Number(createImagePageMatch[2])) });
  }

  const createImageMatch = update.data.match(/^instances:create:image:(\d+):(.+)$/);
  if (createImageMatch && sessions) {
    const accountId = Number(createImageMatch[1]);
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const image = String(createImageMatch[2]);
    const selected = parsed.options.images.find((item: any) => String(item.id) === image);
    parsed.state.image = image;
    parsed.state.image_label = selected?.label ?? image;
    await saveCreateInstanceSession(sessions, update, accountId, parsed);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateFirewallText(parsed.state), reply_markup: renderCreateFirewallKeyboard(accountId, parsed.options.firewalls) });
  }

  const createFirewallMatch = update.data.match(/^instances:create:firewall:(\d+):(.+)$/);
  if (createFirewallMatch && sessions) {
    const accountId = Number(createFirewallMatch[1]);
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const firewall = String(createFirewallMatch[2]);
    if (firewall !== "none") {
      const selected = parsed.options.firewalls.find((item: any) => String(item.id) === firewall);
      parsed.state.firewall_id = Number(firewall);
      parsed.state.firewall_label = selected?.label ?? firewall;
      if (parsed.options.stackscript && env?.DB) {
        const status = await new WindowsInstanceService(env).getRdpFirewallStatus(accountId, Number(firewall), requestId);
        parsed.state.rdp_firewall_ok = status.ok;
        parsed.state.rdp_firewall_message = status.message;
      }
    } else {
      delete parsed.state.firewall_id;
      parsed.state.firewall_label = "不使用防火墙";
      parsed.state.rdp_firewall_ok = true;
      parsed.state.rdp_firewall_message = "未使用 Linode Firewall";
    }
    await saveCreateInstanceSession(sessions, update, accountId, parsed);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: parsed.options.stackscript ? renderWindowsCreateConfirmText(parsed.options.account, parsed.state) : renderCreateConfirmText(parsed.options.account, parsed.state), reply_markup: parsed.options.stackscript ? renderWindowsCreateConfirmKeyboard(accountId, parsed.state) : renderCreateConfirmKeyboard(accountId) });
  }

  const createBackTypeMatch = update.data.match(/^instances:create:back_type:(\d+)$/);
  if (createBackTypeMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: parsed.options.stackscript ? renderWindowsCreateTypeText(parsed.state) : renderCreateTypeText(parsed.options.types, parsed.state), reply_markup: renderCreateTypeKeyboard(Number(createBackTypeMatch[1]), parsed.options.types, parsed.state) });
  }

  const createBackImageMatch = update.data.match(/^instances:create:back_image:(\d+)$/);
  if (createBackImageMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreateImageText(parsed.options.images, parsed.state), reply_markup: renderCreateImageKeyboard(Number(createBackImageMatch[1]), parsed.options.images) });
  }

  const createBackFirewallMatch = update.data.match(/^instances:create:back_firewall:(\d+)$/);
  if (createBackFirewallMatch && sessions) {
    const parsed = await getCreateInstanceSession(sessions, update.fromId);
    const accountId = Number(createBackFirewallMatch[1]);
    return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: parsed.options.stackscript ? renderWindowsCreateFirewallText(parsed.state) : renderCreateFirewallText(parsed.state), reply_markup: renderCreateFirewallKeyboard(accountId, parsed.options.firewalls, parsed.options.stackscript ? `instances:create:back_type:${accountId}` : undefined, parsed.options.stackscript ? "⬅️ 上一步：配置" : undefined) });
  }

  const createConfirmMatch = update.data.match(/^instances:create:confirm:(\d+)$/);
  if (createConfirmMatch && env?.DB && sessions) {
    try {
      const accountId = Number(createConfirmMatch[1]);
      const parsed = await getCreateInstanceSession(sessions, update.fromId);
      const data = await new InstanceService(env).createInstance(accountId, { region: String(parsed.state.region), type: String(parsed.state.type), image: String(parsed.state.image), firewall_id: parsed.state.firewall_id === undefined ? null : Number(parsed.state.firewall_id) }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions.clearCurrentSession(update.fromId);
      return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderCreatedInstanceText(data), reply_markup: { inline_keyboard: [[{ text: "🔄 查看服务器状态", callback_data: `instances:detail:${data.account.id}:${data.instance.id}:account_${data.account.id}` }], [{ text: "↩️ 返回账号服务器", callback_data: `instances:list:account:${data.account.id}` }]] } });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const bootMatch = update.data.match(/^instances:boot:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (bootMatch && env) {
    try {
      const data = await new InstanceService(env).bootInstance(Number(bootMatch[1]), Number(bootMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceOperationSuccessText("boot", data.account, data.instance_id, requestId),
        reply_markup: renderInstanceOperationResultKeyboard(data.account.id, data.instance_id, bootMatch[3])
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const confirmShutdownMatch = update.data.match(/^instances:confirm_shutdown:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (confirmShutdownMatch && env) {
    const suffix = confirmShutdownMatch[3] ? `:${confirmShutdownMatch[3]}` : "";
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: ["⚠️ 确认关机服务器？", "", `账号：#${confirmShutdownMatch[1]}`, `服务器 ID：${confirmShutdownMatch[2]}`, "", "关机会中断当前服务器服务。请确认这是你要执行的操作。"].join("\n"),
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚠️ 确认关机", callback_data: `instances:shutdown:${confirmShutdownMatch[1]}:${confirmShutdownMatch[2]}${suffix}`, style: "primary" }],
          [{ text: "❌ 取消，返回详情", callback_data: `instances:detail:${confirmShutdownMatch[1]}:${confirmShutdownMatch[2]}${suffix}` }]
        ]
      }
    });
  }

  const shutdownMatch = update.data.match(/^instances:shutdown:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (shutdownMatch && env) {
    try {
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `instance:shutdown:${shutdownMatch[1]}:${shutdownMatch[2]}`, requestId, "shutdown");
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new InstanceService(env).shutdownInstance(Number(shutdownMatch[1]), Number(shutdownMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceOperationSuccessText("shutdown", data.account, data.instance_id, requestId),
        reply_markup: renderInstanceOperationResultKeyboard(data.account.id, data.instance_id, shutdownMatch[3])
      });
    } catch (error) {
      if (isProtectedInstanceError(error)) {
        const suffix = shutdownMatch[3] ? `:${shutdownMatch[3]}` : "";
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionBlockedText("shutdown"), reply_markup: { inline_keyboard: [[{ text: "🛡 查看保护实例", callback_data: "protect:menu" }], [{ text: "↩️ 返回服务器详情", callback_data: `instances:detail:${shutdownMatch[1]}:${shutdownMatch[2]}${suffix}` }]] } });
      }
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const confirmRebootMatch = update.data.match(/^instances:confirm_reboot:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (confirmRebootMatch && env) {
    const suffix = confirmRebootMatch[3] ? `:${confirmRebootMatch[3]}` : "";
    return client.editMessage({
      chat_id: update.chatId,
      message_id: update.messageId,
      text: ["⚠️ 确认重启服务器？", "", `账号：#${confirmRebootMatch[1]}`, `服务器 ID：${confirmRebootMatch[2]}`, "", "重启会短暂中断当前服务器服务。请确认这是你要执行的操作。"].join("\n"),
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 确认重启", callback_data: `instances:reboot:${confirmRebootMatch[1]}:${confirmRebootMatch[2]}${suffix}`, style: "primary" }],
          [{ text: "❌ 取消，返回详情", callback_data: `instances:detail:${confirmRebootMatch[1]}:${confirmRebootMatch[2]}${suffix}` }]
        ]
      }
    });
  }

  const rebootMatch = update.data.match(/^instances:reboot:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (rebootMatch && env) {
    try {
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `instance:reboot:${rebootMatch[1]}:${rebootMatch[2]}`, requestId, "reboot");
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new InstanceService(env).rebootInstance(Number(rebootMatch[1]), Number(rebootMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceOperationSuccessText("reboot", data.account, data.instance_id, requestId),
        reply_markup: renderInstanceOperationResultKeyboard(data.account.id, data.instance_id, rebootMatch[3])
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
          [{ text: "🚨 确认删除", callback_data: `instances:delete:${confirmDeleteMatch[1]}:${confirmDeleteMatch[2]}`, style: "danger" }],
          [{ text: "❌ 取消，返回详情", callback_data: `instances:detail:${confirmDeleteMatch[1]}:${confirmDeleteMatch[2]}` }]
        ]
      }
    });
  }

  const deleteMatch = update.data.match(/^instances:delete:(\d+):(\d+)$/);
  if (deleteMatch && env) {
    try {
      const cooldown = await acquireDangerousActionCooldown(env, update.fromId, `instance:delete:${deleteMatch[1]}:${deleteMatch[2]}`, requestId, "delete");
      if (!cooldown.acquired) return renderTelegramCooldownMessage(update, client, cooldown);
      const data = await new InstanceService(env).deleteInstance(Number(deleteMatch[1]), Number(deleteMatch[2]), { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceOperationSuccessText("delete", data.account, data.instance_id, requestId),
        reply_markup: { inline_keyboard: [[{ text: "📄 查看审计日志", callback_data: "menu:audit_logs" }], [{ text: "↩️ 返回服务器列表", callback_data: `instances:list:account:${data.account.id}` }]] }
      });
    } catch (error) {
      if (isProtectedInstanceError(error)) {
        return client.editMessage({ chat_id: update.chatId, message_id: update.messageId, text: renderProtectionBlockedText("delete"), reply_markup: { inline_keyboard: [[{ text: "🛡 查看保护实例", callback_data: "protect:menu" }], [{ text: "↩️ 返回服务器详情", callback_data: `instances:detail:${deleteMatch[1]}:${deleteMatch[2]}` }]] } });
      }
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const dangerMatch = update.data.match(/^instances:danger:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (dangerMatch && env) {
    try {
      const data = await new InstanceService(env).getAccountInstance(Number(dangerMatch[1]), Number(dangerMatch[2]), requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceDangerText(data),
        reply_markup: renderInstanceDangerKeyboard(data, dangerMatch[3])
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  const detailMatch = update.data.match(/^instances:detail:(\d+):(\d+)(?::([A-Za-z0-9_]+))?$/);
  if (detailMatch && env) {
    try {
      const data = await new InstanceService(env).getAccountInstance(Number(detailMatch[1]), Number(detailMatch[2]), requestId);
      return client.editMessage({
        chat_id: update.chatId,
        message_id: update.messageId,
        text: renderInstanceDetailText(data),
        reply_markup: renderInstanceDetailKeyboard(data, detailMatch[3])
      });
    } catch (error) {
      return renderTelegramCallbackError(update, client, error, requestId);
    }
  }

  return client.sendMessage({
    chat_id: update.chatId,
    text: [`⚠️ 这个按钮暂时不能继续`, "", `按钮：${update.data}`, "", "可能原因：旧消息按钮、流程已经过期、或当前版本已经调整了菜单。", "请从下方重新进入对应功能。"].join("\n"),
    reply_markup: { inline_keyboard: [[{ text: "🖥 服务器管理", callback_data: "menu:instances" }], [{ text: "🏠 主菜单", callback_data: "menu:main" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] }
  });
}


async function getCreateInstanceSession(sessions: Pick<BotSessionService, "getCurrentSession" | "setCurrentSession" | "clearCurrentSession">, userId: string): Promise<{ accountId: number; options: any; state: Record<string, unknown> }> {
  const session = await sessions.getCurrentSession(userId);
  if (!session || !["creating_instance", "creating_windows_instance", "creating_windows_password", "creating_windows_username", "creating_windows_label"].includes(session.state)) throw new AppError(ErrorCode.VALIDATION_ERROR, "创建服务器会话已过期，请重新开始。", "req_telegram", 400);
  if (Date.parse(session.expires_at) <= Date.now()) {
    await sessions.clearCurrentSession(userId);
    throw new AppError(ErrorCode.VALIDATION_ERROR, "创建服务器会话已过期，请重新开始。", "req_telegram", 400);
  }
  const parsed = parseCallbackSessionData(session.data_json);
  return { accountId: Number(parsed.account_id), options: parsed.options ?? {}, state: (parsed.state && typeof parsed.state === "object" ? parsed.state : {}) as Record<string, unknown> };
}

async function saveCreateInstanceSession(sessions: Pick<BotSessionService, "getCurrentSession" | "setCurrentSession" | "clearCurrentSession">, update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>, accountId: number, parsed: { options: any; state: Record<string, unknown> }): Promise<void> {
  const current = await sessions.getCurrentSession(update.fromId);
  await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: current?.state === "creating_windows_instance" || current?.state === "creating_windows_password" || current?.state === "creating_windows_username" || current?.state === "creating_windows_label" ? "creating_windows_instance" : "creating_instance", data: { account_id: accountId, options: parsed.options, state: parsed.state } });
}

function parseCallbackSessionData(dataJson?: string | null): Record<string, any> {
  if (!dataJson) return {};
  try {
    const parsed = JSON.parse(dataJson);
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function instanceListBackCallback(source: string | undefined, accountId: number): string {
  if (source?.startsWith("account_")) return `instances:list:account:${source.slice("account_".length) || accountId}`;
  if (source?.startsWith("group_")) return `instances:list:group:${source.slice("group_".length)}`;
  if (source === "status_running") return "instances:list:status:running";
  if (source === "status_offline") return "instances:list:status:offline";
  return "instances:list:all";
}

function renderInstanceOperationResultKeyboard(accountId: number, instanceId: number, source?: string) {
  const normalizedSource = source ?? `account_${accountId}`;
  return {
    inline_keyboard: [
      [{ text: "🔄 刷新服务器状态", callback_data: `instances:detail:${accountId}:${instanceId}:${normalizedSource}` }],
      [{ text: "📄 查看审计日志", callback_data: "menu:audit_logs" }],
      [{ text: "↩️ 返回上一列表", callback_data: instanceListBackCallback(source, accountId) }]
    ]
  };
}

function renderInstanceOperationSuccessText(
  action: "boot" | "shutdown" | "reboot" | "delete",
  account: { id: number; alias: string },
  instanceId: number,
  requestId: string
): string {
  const actionLabel = action === "boot" ? "开机" : action === "shutdown" ? "关机" : action === "reboot" ? "重启" : "删除";
  const asyncNote = action === "delete"
    ? "Linode API 已接受删除请求。删除通常不可恢复，请通过审计日志确认操作记录。"
    : "Linode API 已接受请求，服务器状态会稍后变化。最终状态以刷新后的服务器详情为准。";
  return renderTelegramOperationResult({
    title: `${actionLabel}服务器`,
    status: "submitted",
    requestId,
    fields: [
      { label: "账号", value: `#${account.id} ${account.alias}` },
      { label: "服务器", value: `#${instanceId}` }
    ],
    message: asyncNote,
    nextStep: action === "delete" ? "查看审计日志确认操作记录" : "刷新服务器状态确认最终结果"
  });
}

async function acquireDangerousActionCooldown(env: Env | undefined, fromId: string, key: string, requestId: string, action: BatchAction | "reboot"): Promise<ActionCooldownResult> {
  if (action === "boot") return { acquired: true } as const;
  if (env?.DB) {
    const settings = await new AppSettingsService(env).getSettings();
    if (settings.dangerous_action_cooldown_enabled === false) return { acquired: true } as const;
  }
  return acquireActionCooldown(`telegram:${fromId}:${key}`, requestId);
}

function renderTelegramCooldownMessage(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  cooldown: Exclude<ActionCooldownResult, { acquired: true }>
): TelegramClientResult {
  return client.editMessage({
    chat_id: update.chatId,
    message_id: update.messageId,
    text: renderActionCooldownText(cooldown),
    reply_markup: renderCheckinInlineKeyboard()
  });
}

function formatCallbackErrorMessage(error: AppError): string {
  const generic = mapTelegramErrorMessage(error.code);
  const detail = sanitizeCallbackErrorDetail(error.message);
  if (error.code === ErrorCode.LINODE_API_ERROR && detail && detail !== "Operation failed" && detail !== generic) {
    return `${generic}\n\n错误详情：${detail}`;
  }
  if (detail && detail !== generic && error.code !== ErrorCode.UNAUTHORIZED && error.code !== ErrorCode.FORBIDDEN) {
    return `${generic}\n\n错误详情：${detail}`;
  }
  return generic;
}

function sanitizeCallbackErrorDetail(message: string): string | null {
  const detail = message
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <redacted>")
    .replace(/(authorization\s*[:=]\s*)[^,;\s]+/gi, "$1<redacted>")
    .replace(/(password\s*[:=]\s*)[^,;\s]+/gi, "$1<redacted>")
    .replace(/(secret\s*[:=]\s*)[^,;\s]+/gi, "$1<redacted>")
    .trim();
  return detail ? detail.slice(0, 260) : null;
}

function isProtectedInstanceError(error: unknown): boolean {
  return error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR && error.message.includes("Protected instance");
}

function renderTelegramCallbackError(
  update: Extract<ParsedTelegramUpdate, { kind: "callback_query" }>,
  client: TelegramClient,
  error: unknown,
  requestId: string
): TelegramClientResult {
  const appError = error instanceof AppError
    ? error
    : new AppError(ErrorCode.LINODE_API_ERROR, error instanceof Error && error.message ? error.message : "Operation failed", requestId, 502);
  return client.sendMessage({
    chat_id: update.chatId,
    text: renderTelegramOperationResult({ title: "操作失败", status: "failed", requestId, errorMessage: formatCallbackErrorMessage(appError), errorCode: appError.code, nextStep: "按提示处理后重试，或从主菜单重新进入" }),
    reply_markup: { inline_keyboard: [[{ text: "🖥 服务器管理", callback_data: "menu:instances" }], [{ text: "🏠 主菜单", callback_data: "menu:main" }], [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]] }
  });
}
