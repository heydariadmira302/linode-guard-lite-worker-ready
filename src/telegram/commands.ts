import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import type { BotSessionService } from "../services/bot-session-service";
import { AdminPresenceService } from "../services/admin-presence-service";
import { AppSettingsService } from "../services/app-settings-service";
import { DiagnosticsService } from "../services/setup-service";
import { ScheduleService } from "../services/schedule-service";
import { StatusOverviewService } from "../services/status-overview-service";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult } from "./types";
import { continueAddAccountFlow } from "./account-flow";
import { AccountService } from "../services/account-service";
import { AuditService } from "../services/audit-service";
import { InstanceService } from "../services/instance-service";
import { validateWindowsPassword, validateWindowsUsername } from "../services/windows-instance-service";
import { AuditRepository } from "../storage/audit-repository";
import { renderCheckinInlineKeyboard, renderMainReplyKeyboard } from "./keyboards";
import { renderAccountActionResultText, renderAccountDetailKeyboard, renderAccountsMenuKeyboard, renderAccountsMenuText, renderAdminsMenuKeyboard, renderAdminsMenuText, renderDiagnosticsMenuKeyboard, renderDiagnosticsMenuText, renderHelpText, renderMoreMenuText, renderMoreMenuKeyboard, renderMyIdKeyboard, renderMyIdText, renderPrivacyMenuKeyboard, renderPrivacyMenuText, renderSettingsMenuKeyboard, renderSettingsMenuText } from "./menus";
import { renderAllInstancesText, renderCreateRegionKeyboard, renderCreateRegionText, renderInstancesListKeyboard, renderWindowsAdminFallbackKeyboard, renderWindowsAdminFallbackText, renderWindowsLabelModeKeyboard, renderWindowsLabelModeText, renderWindowsUsernameModeKeyboard, renderWindowsUsernameModeText } from "./instance-renderer";
import { GroupService } from "../services/group-service";
import { renderGroupsMenuKeyboard, renderGroupsMenuText } from "./group-renderer";
import { renderSetupWizardText } from "./setup-renderer";
import { renderAdminPresenceCheckinKeyboard, renderAdminPresenceCheckinText, renderAdminPresenceMenuKeyboard, renderAdminPresenceMenuText, renderAdminPresencePolicyCreatedText, renderAdminPresencePolicyDetailKeyboard, renderAdminPresencePolicyNamePrompt, renderAdminPresencePolicyNamePromptKeyboard, renderAdminPresencePolicyTimeKeyboard, renderAdminPresencePolicyTimeText, renderAdminPresencePolicyUpdatedText } from "./admin-presence-renderer";
import { renderScheduleActionResultKeyboard, renderScheduleActionResultText, renderSchedulesMenuKeyboard, renderSchedulesMenuText } from "./schedule-renderer";
import { renderBatchMenuKeyboard, renderBatchMenuText, renderBatchResultKeyboard, renderBatchResultText } from "./batch-renderer";
import { BatchService } from "../services/batch-service";
import { renderSecurityMenuKeyboard, renderSecurityMenuText } from "./security-renderer";
import { renderAuditLogsKeyboard, renderAuditLogsText } from "./audit-renderer";
import { renderStatusOverviewKeyboard, renderStatusOverviewText } from "./status-overview-renderer";
import { SecurityService } from "../services/security-service";
import { notifyNewSuperAdmin } from "../services/super-admin-notification-service";
import { addD1SuperAdmin, canManageSuperAdmins, listSuperAdmins } from "../services/super-admin-service";
import { acquireActionCooldown, renderActionCooldownText } from "./action-cooldown";
import { renderTelegramOperationResult } from "./result-template";

export async function handleTelegramMessageCommand(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult> {
  if (!update.command) {
    const replyText = update.text.trim();
    if (replyText === "📊 状态总览" || replyText === "📊 总览" || replyText === "状态总览" || replyText === "总览") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new StatusOverviewService(env).getOverview(requestId);
        return client.sendMessage({ chat_id: update.chatId, text: renderStatusOverviewText(data, env.APP_TIMEZONE), reply_markup: renderStatusOverviewKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "状态总览需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (replyText === "🏠 主控菜单" || replyText === "🏠 主菜单" || replyText === "主控菜单" || replyText === "主菜单") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "主导航已放到聊天框下方。请选择下方主按钮进入对应功能。", reply_markup: renderMainReplyKeyboard() });
    }
    if (replyText === "🖥 云机管理" || replyText === "🖥 服务器" || replyText === "云机管理" || replyText === "服务器") {
      await sessions.clearCurrentSession(update.fromId);
      const data = await new InstanceService(env).listAllActiveAccountInstances(requestId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAllInstancesText(data.accounts), reply_markup: renderInstancesListKeyboard(data.accounts, "all") });
    }
    if (replyText === "❤️ 打卡保活" || replyText === "❤️ 打卡" || replyText === "打卡保活" || replyText === "打卡") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new AdminPresenceService(env).checkin({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
        return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresenceCheckinText(data), reply_markup: renderAdminPresenceCheckinKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "打卡功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (replyText === "📄 审计" || replyText === "审计" || replyText === "审计日志") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const view = { limit: 5, offset: 0 };
        const data = await new AuditService(new AuditRepository(env.DB)).listAuditLogs(view);
        return client.sendMessage({ chat_id: update.chatId, text: renderAuditLogsText(data.audit_logs, env.APP_TIMEZONE, view), reply_markup: renderAuditLogsKeyboard(view) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "审计日志功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "🏠 主控菜单" || update.text === "🏠 主菜单" || update.text === "主控菜单" || update.text === "主菜单") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "主导航已放到聊天框下方。请选择下方主按钮进入对应功能。", reply_markup: renderMainReplyKeyboard() });
    }
    if (update.text === "🖥 云机管理" || update.text === "🖥 服务器" || update.text === "云机管理" || update.text === "服务器") {
      await sessions.clearCurrentSession(update.fromId);
      const data = await new InstanceService(env).listAllActiveAccountInstances(requestId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAllInstancesText(data.accounts), reply_markup: renderInstancesListKeyboard(data.accounts, "all") });
    }
    if (update.text === "⚡ 批量" || update.text === "⚡ 批量操作" || update.text === "批量" || update.text === "批量操作") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderBatchMenuText(), reply_markup: renderBatchMenuKeyboard() });
    }
    if (update.text === "📋 更多功能" || update.text === "📋 更多" || update.text === "更多功能" || update.text === "更多") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderMoreMenuText(), reply_markup: renderMoreMenuKeyboard() });
    }
    if (update.text === "👤 账号" || update.text === "账号") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAccountsMenuText(), reply_markup: renderAccountsMenuKeyboard() });
    }
    if (update.text === "🔒 隐私" || update.text === "隐私" || update.text === "隐私清理") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const settings = await new AppSettingsService(env).getSettings();
        return client.sendMessage({ chat_id: update.chatId, text: renderPrivacyMenuText(settings), reply_markup: renderPrivacyMenuKeyboard(settings) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "隐私清理功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "📁 分组" || update.text === "分组") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new GroupService(env).listGroups();
        return client.sendMessage({ chat_id: update.chatId, text: renderGroupsMenuText(data.groups), reply_markup: renderGroupsMenuKeyboard(data.groups) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "分组功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "🛡 安全" || update.text === "🛡 安全事件" || update.text === "安全" || update.text === "安全事件") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new SecurityService(env).getOverview();
        return client.sendMessage({ chat_id: update.chatId, text: renderSecurityMenuText(data.open_events, data.recent_events), reply_markup: renderSecurityMenuKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "安全事件功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "📅 定时计划" || update.text === "⏰ 定时" || update.text === "⏰ 定时任务" || update.text === "定时" || update.text === "定时任务" || update.text === "定时计划") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const settings = await new ScheduleService(env).getQuickPowerSettings();
        return client.sendMessage({ chat_id: update.chatId, text: renderSchedulesMenuText(settings), reply_markup: renderSchedulesMenuKeyboard(settings) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: renderSchedulesMenuText(), reply_markup: renderSchedulesMenuKeyboard() });
    }
    if (update.text === "❤️ 打卡保活" || update.text === "❤️ 保活打卡" || update.text === "打卡保活" || update.text === "保活打卡") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new AdminPresenceService(env).getStatus();
        return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresenceMenuText(data), reply_markup: renderAdminPresenceMenuKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "保活打卡功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "🪪 我的ID" || update.text === "我的ID" || update.text === "我的id" || update.text === "myid") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderMyIdText({ userId: update.fromId, username: update.fromUsername, firstName: update.fromFirstName, lastName: update.fromLastName, languageCode: update.fromLanguageCode, chatId: update.chatId }), reply_markup: renderMyIdKeyboard({ userId: update.fromId, username: update.fromUsername, chatId: update.chatId }) });
    }
    if (update.text === "👑 管理员" || update.text === "管理员" || update.text === "管理员管理") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const admins = await listSuperAdmins(env);
        const canManage = canManageSuperAdmins(env, update.fromId);
        return client.sendMessage({ chat_id: update.chatId, text: renderAdminsMenuText(admins, canManage), reply_markup: renderAdminsMenuKeyboard(admins, canManage) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "管理员管理需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "⚙️ 设置" || update.text === "设置") {
      await sessions.clearCurrentSession(update.fromId);
      const settings = env.DB ? await new AppSettingsService(env).getSettings() : undefined;
      return client.sendMessage({ chat_id: update.chatId, text: renderSettingsMenuText(settings), reply_markup: renderSettingsMenuKeyboard(settings) });
    }
    if (update.text === "系统自检") {
      await sessions.clearCurrentSession(update.fromId);
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.sendMessage({ chat_id: update.chatId, text: renderDiagnosticsMenuText(deployment.status, jobs.missing, jobs.disabled, {
        failedChecks: Object.entries(deployment.checks).filter(([, check]) => !check.ok).map(([name]) => name),
        bootSafetyMode: deployment.boot_safety?.mode,
        botManagedOfflineCount: deployment.boot_safety?.bot_managed_offline_count
      }), reply_markup: renderDiagnosticsMenuKeyboard() });
    }
    if (update.text === "❤️ 打卡保活" || update.text === "❤️ 打卡" || update.text === "打卡保活" || update.text === "打卡") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new AdminPresenceService(env).checkin({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
        return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresenceCheckinText(data), reply_markup: renderAdminPresenceCheckinKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "请点击下方按钮完成打卡。", reply_markup: renderCheckinInlineKeyboard() });
    }
    const windowsPasswordFlowResult = await continueWindowsPasswordFlow(update, client, sessions, env, requestId);
    if (windowsPasswordFlowResult) return windowsPasswordFlowResult;
    const windowsUsernameFlowResult = await continueWindowsUsernameFlow(update, client, sessions, env, requestId);
    if (windowsUsernameFlowResult) return windowsUsernameFlowResult;
    const windowsLabelFlowResult = await continueWindowsLabelFlow(update, client, sessions, env, requestId);
    if (windowsLabelFlowResult) return windowsLabelFlowResult;
    const accountRenameFlowResult = await continueAccountRenameFlow(update, client, sessions, env, requestId);
    if (accountRenameFlowResult) return accountRenameFlowResult;
    const accountTokenFlowResult = await continueAccountTokenUpdateFlow(update, client, sessions, env, requestId);
    if (accountTokenFlowResult) return accountTokenFlowResult;
    const scheduleFlowResult = await continueScheduleFlow(update, client, sessions, env, requestId);
    if (scheduleFlowResult) return scheduleFlowResult;
    const adminPresenceFlowResult = await continueAdminPresencePolicyFlow(update, client, sessions, env, requestId);
    if (adminPresenceFlowResult) return adminPresenceFlowResult;
    const batchDeleteFlowResult = await continueBatchDeleteConfirmFlow(update, client, sessions, env, requestId);
    if (batchDeleteFlowResult) return batchDeleteFlowResult;
    const groupFlowResult = await continueGroupFlow(update, client, sessions, env, requestId);
    if (groupFlowResult) return groupFlowResult;
    const adminFlowResult = await continueSuperAdminFlow(update, client, sessions, env, requestId);
    if (adminFlowResult) return adminFlowResult;
    const flowResult = await continueAddAccountFlow(update, client, sessions, env, requestId);
    if (flowResult) return flowResult;
  }

  switch (update.command) {
    case "start":
      return client.sendMessage({ chat_id: update.chatId, text: "主导航已放到聊天框下方。请选择下方主按钮进入对应功能。", reply_markup: renderMainReplyKeyboard() });
    case "help":
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
    case "myid":
      return client.sendMessage({ chat_id: update.chatId, text: renderMyIdText({ userId: update.fromId, username: update.fromUsername, firstName: update.fromFirstName, lastName: update.fromLastName, languageCode: update.fromLanguageCode, chatId: update.chatId }), reply_markup: renderMyIdKeyboard({ userId: update.fromId, username: update.fromUsername, chatId: update.chatId }) });
    case "setup": {
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.sendMessage({ chat_id: update.chatId, text: renderSetupWizardText(deployment, jobs) });
    }
    case "cancel":
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "已取消当前操作。" });
    default: {
      const windowsPasswordFlowResult = await continueWindowsPasswordFlow(update, client, sessions, env, requestId);
      if (windowsPasswordFlowResult) return windowsPasswordFlowResult;
      const windowsUsernameFlowResult = await continueWindowsUsernameFlow(update, client, sessions, env, requestId);
      if (windowsUsernameFlowResult) return windowsUsernameFlowResult;
      const windowsLabelFlowResult = await continueWindowsLabelFlow(update, client, sessions, env, requestId);
      if (windowsLabelFlowResult) return windowsLabelFlowResult;
      const accountRenameFlowResult = await continueAccountRenameFlow(update, client, sessions, env, requestId);
      if (accountRenameFlowResult) return accountRenameFlowResult;
      const accountTokenFlowResult = await continueAccountTokenUpdateFlow(update, client, sessions, env, requestId);
      if (accountTokenFlowResult) return accountTokenFlowResult;
      const scheduleFlowResult = await continueScheduleFlow(update, client, sessions, env, requestId);
      if (scheduleFlowResult) return scheduleFlowResult;
      const adminPresenceFlowResult = await continueAdminPresencePolicyFlow(update, client, sessions, env, requestId);
      if (adminPresenceFlowResult) return adminPresenceFlowResult;
      const batchDeleteFlowResult = await continueBatchDeleteConfirmFlow(update, client, sessions, env, requestId);
      if (batchDeleteFlowResult) return batchDeleteFlowResult;
      const groupFlowResult = await continueGroupFlow(update, client, sessions, env, requestId);
      if (groupFlowResult) return groupFlowResult;
      const adminFlowResult = await continueSuperAdminFlow(update, client, sessions, env, requestId);
      if (adminFlowResult) return adminFlowResult;
      const flowResult = await continueAddAccountFlow(update, client, sessions, env, requestId);
      if (flowResult) return flowResult;
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
    }
  }
}

async function continueSuperAdminFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "adding_super_admin") return null;
  if (!env.DB) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: "管理员管理需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
  }
  if (!canManageSuperAdmins(env, update.fromId)) {
    await sessions.clearCurrentSession(update.fromId);
    const admins = await listSuperAdmins(env);
    return client.sendMessage({ chat_id: update.chatId, text: `${renderAdminsMenuText(admins, false)}\n\n⛔ 只有 Cloudflare Secret 里配置的根管理员可以添加管理员。`, reply_markup: renderAdminsMenuKeyboard(admins, false) });
  }
  const raw = update.text.trim();
  if (!/^\d{4,20}$/.test(raw)) {
    return client.sendMessage({ chat_id: update.chatId, text: "管理员 ID 格式不正确。请发送 Telegram 数字 ID，不是 @用户名。" });
  }
  try {
    await addD1SuperAdmin(env, raw, `telegram:${update.fromId}`);
    const notification = await notifyNewSuperAdmin(env, raw);
    const admins = await listSuperAdmins(env);
    await sessions.clearCurrentSession(update.fromId);
    const suffix = notification.ok
      ? `\n\n✅ 已主动通知新管理员 ${raw}。`
      : `\n\n⚠️ 管理员已添加，但主动通知 ${raw} 失败。通常是对方还没给 Bot 发过 /start，请让对方先打开 Bot 后再试。`;
    return client.sendMessage({ chat_id: update.chatId, text: `${renderAdminsMenuText(admins, true)}${suffix}`, reply_markup: renderAdminsMenuKeyboard(admins, true) });
  } catch (error) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "添加管理员失败", status: "failed", requestId, errorMessage: error instanceof Error ? error.message : "未知错误", nextStep: "请确认输入的是 Telegram 数字 ID，然后重试。" }), reply_markup: renderCheckinInlineKeyboard() });
  }
}

async function continueWindowsPasswordFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  _env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "creating_windows_password") return null;
  const parsed = parseSessionData(session.data_json);
  const accountId = Number(parsed.account_id);
  const state = parsed.state && typeof parsed.state === "object" ? parsed.state as Record<string, unknown> : {};
  const options = parsed.options ?? {};
  const actions: TelegramClientAction[] = [client.deleteMessage(update.chatId, update.messageId) as TelegramClientAction];
  try {
    state.administrator_password = validateWindowsPassword(update.text, requestId);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_instance", data: { account_id: accountId, options, state } });
    actions.push(client.sendMessage({ chat_id: update.chatId, text: `${renderWindowsUsernameModeText(state)}\n\n✅ 已接收自定义密码。后续成功页仍会只显示一次，请核对并保存。`, reply_markup: renderWindowsUsernameModeKeyboard(accountId) }) as TelegramClientAction);
    return actions;
  } catch {
    actions.push(client.sendMessage({ chat_id: update.chatId, text: "密码不符合要求：10-64 位，包含大小写字母、数字、符号，不能有空格/中文/< > & 引号，也不能太弱。请重新发送，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() }) as TelegramClientAction);
    return actions;
  }
}



async function continueWindowsUsernameFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  _env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "creating_windows_username") return null;
  const parsed = parseSessionData(session.data_json);
  const accountId = Number(parsed.account_id);
  const state = parsed.state && typeof parsed.state === "object" ? parsed.state as Record<string, unknown> : {};
  const options = parsed.options ?? {};
  try {
    state.windows_username = validateWindowsUsername(update.text, requestId);
    await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_instance", data: { account_id: accountId, options, state } });
    return client.sendMessage({ chat_id: update.chatId, text: `${renderWindowsAdminFallbackText(state)}\n\n✅ Windows 用户名：${state.windows_username}`, reply_markup: renderWindowsAdminFallbackKeyboard(accountId) });
  } catch {
    return client.sendMessage({ chat_id: update.chatId, text: "用户名不符合要求：英文开头，3-20 位，只能包含英文、数字、下划线、短横线，且不能使用系统保留名。请重新发送，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
  }
}

async function continueWindowsLabelFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  _env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "creating_windows_label") return null;
  const parsed = parseSessionData(session.data_json);
  const accountId = Number(parsed.account_id);
  const state = parsed.state && typeof parsed.state === "object" ? parsed.state as Record<string, unknown> : {};
  const options = parsed.options ?? {};
  const label = update.text.trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(label)) {
    return client.sendMessage({ chat_id: update.chatId, text: "服务器名称不符合 Linode 要求：3-64 位，只能包含英文、数字、点、下划线、短横线，不支持中文。请重新发送，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
  }
  state.label = label;
  await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "creating_windows_instance", data: { account_id: accountId, options, state } });
  const text = renderCreateRegionText((options as any).regions ?? []).replace("➕ 创建 Linux 服务器", "🪟 创建 Windows 服务器") + (state.windows_version === "w11-ltsc-2024" ? "\n\nBot 会自动查找官方 ISO，不需要你输入 ISO URL。" : state.windows_version === "2k25-cn" ? "\n\nWindows Server 2025 简体中文版会使用官方 Evaluation ISO 路线。" : state.windows_version === "2k25-en" ? "\n\nWindows Server 2025 English 会使用官方 Evaluation ISO 路线。" : "");
  return client.sendMessage({ chat_id: update.chatId, text: `${text}\n\n✅ 服务器名称：${label}`, reply_markup: renderCreateRegionKeyboard(accountId, (options as any).regions ?? [], 0, `windows:create:back_label:${accountId}`, "⬅️ 上一步：命名") });
}

async function continueBatchDeleteConfirmFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "confirming_batch_delete") return null;
  const parsed = parseSessionData(session.data_json);
  if (update.text.trim() !== "DELETE") {
    return client.sendMessage({ chat_id: update.chatId, text: "没有执行删除。请发送 DELETE 确认，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
  }
  try {
    const settings = await new AppSettingsService(env).getSettings();
    if (settings.dangerous_action_cooldown_enabled !== false) {
      const cooldown = acquireActionCooldown(`telegram:${update.fromId}:batch:delete:${parsed.scope ?? "all"}:${parsed.account_id ?? parsed.group_id ?? "all"}`, requestId);
      if (!cooldown.acquired) {
        return client.sendMessage({ chat_id: update.chatId, text: renderActionCooldownText(cooldown), reply_markup: renderCheckinInlineKeyboard() });
      }
    }
    let result;
    if (parsed.scope === "account") {
      const accountId = Number(parsed.account_id);
      result = await new BatchService(env).runAccountBatch(accountId, "delete", { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    } else if (parsed.scope === "group") {
      const groupId = Number(parsed.group_id);
      result = await new BatchService(env).runGroupBatch(groupId, "delete", { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    } else {
      result = await new BatchService(env).runAllAccountsBatch("delete", { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    }
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderBatchResultText(result, requestId), reply_markup: renderBatchResultKeyboard() });
  } catch {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "批量删除", status: "failed", requestId, errorMessage: "批量删除执行失败，请查看审计日志或稍后重试。", nextStep: "查看审计日志确认失败原因" }), reply_markup: renderCheckinInlineKeyboard() });
  }
}

async function continueAccountRenameFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "renaming_account") return null;
  const parsed = parseSessionData(session.data_json);
  const accountId = Number(parsed.account_id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: "账号改名会话已失效，请重新进入账号详情。", reply_markup: renderCheckinInlineKeyboard() });
  }
  try {
    const account = await new AccountService(env).renameAccount(accountId, update.text, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderAccountActionResultText("✅ 账号名已更新", account), reply_markup: renderAccountDetailKeyboard(account) });
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "修改账号名", status: "failed", requestId, errorMessage: appError?.message ?? "账号名不符合要求或已存在。", errorCode: appError?.code, nextStep: "请重新发送一个不重复的账号名，或点下方按钮取消" }), reply_markup: { inline_keyboard: [[{ text: "取消改名", callback_data: `accounts:rename:cancel:${accountId}` }], [{ text: "返回账号详情", callback_data: `accounts:detail:${accountId}` }]] } });
  }
}

async function continueAccountTokenUpdateFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "updating_account_token") return null;
  const parsed = parseSessionData(session.data_json);
  const accountId = Number(parsed.account_id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: "账号 Token 更新会话已失效，请重新进入账号详情。", reply_markup: renderCheckinInlineKeyboard() });
  }
  const actions: TelegramClientAction[] = [client.deleteMessage(update.chatId, update.messageId) as TelegramClientAction];
  try {
    const account = await new AccountService(env).updateAccountToken(accountId, update.text, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    actions.push(client.sendMessage({ chat_id: update.chatId, text: renderAccountActionResultText("✅ Token 已更新", account), reply_markup: renderAccountDetailKeyboard(account) }) as TelegramClientAction);
    return actions;
  } catch {
    actions.push(client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "更新账号 Token", status: "failed", requestId, errorMessage: "请检查 Token 是否完整、权限是否足够，然后重新发送。", nextStep: "重新发送 Token，或点下方按钮取消" }), reply_markup: { inline_keyboard: [[{ text: "取消更新", callback_data: `accounts:update_token:cancel:${accountId}` }], [{ text: "返回账号详情", callback_data: `accounts:detail:${accountId}` }]] } }) as TelegramClientAction);
    return actions;
  }
}

async function continueScheduleFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || session.state !== "creating_schedule_custom_time") return null;
  const parsed = parseSessionData(session.data_json);
  const action = parsed.action === "boot" || parsed.action === "shutdown" || parsed.action === "reboot" ? parsed.action : null;
  const scope = parsed.scope === "account" ? "account" : parsed.scope === "group" ? "group" : parsed.scope === "instance" ? "instance" : parsed.scope === "all" ? "all" : null;
  const accountId = scope === "account" || scope === "instance" ? Number(parsed.account_id) : null;
  const groupId = scope === "group" ? Number(parsed.group_id) : null;
  const instanceId = scope === "instance" ? Number(parsed.instance_id) : null;
  if (!action || !scope || ((scope === "account" || scope === "instance") && (!Number.isInteger(accountId) || Number(accountId) <= 0)) || (scope === "group" && (!Number.isInteger(groupId) || Number(groupId) <= 0)) || (scope === "instance" && (!Number.isInteger(instanceId) || Number(instanceId) <= 0))) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: "定时任务会话已失效，请重新创建。", reply_markup: renderCheckinInlineKeyboard() });
  }
  const resolvedAccountId = scope === "account" || scope === "instance" ? Number(accountId) : null;
  const resolvedGroupId = scope === "group" ? Number(groupId) : null;
  const resolvedInstanceId = scope === "instance" ? Number(instanceId) : null;
  const cronExpr = parseScheduleCronInput(update.text.trim());
  if (!cronExpr) {
    return client.sendMessage({ chat_id: update.chatId, text: "时间格式不正确。请发送 09:30、22:00，或 5 段 Cron，例如：30 9 * * *。发送 /cancel 可取消。", reply_markup: renderCheckinInlineKeyboard() });
  }
  try {
    const data = await new ScheduleService(env).createSchedule({
      name: `自定义 ${scope === "instance" ? `实例 #${resolvedInstanceId} ` : scope === "account" ? `账号 #${resolvedAccountId} ` : scope === "group" ? `分组 #${resolvedGroupId} ` : ""}${action === "boot" ? "开机" : action === "shutdown" ? "关机" : "重启"}`,
      action,
      scope,
      account_id: resolvedAccountId,
      group_id: resolvedGroupId,
      instance_id: resolvedInstanceId,
      cron_expr: cronExpr,
      timezone: env.APP_TIMEZONE ?? "Asia/Shanghai",
      enabled: true
    }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderScheduleActionResultText("created", data.schedule), reply_markup: renderScheduleActionResultKeyboard() });
  } catch {
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "创建定时任务", status: "failed", requestId, errorMessage: "时间或 Cron 格式不正确，或目标范围校验失败。", nextStep: "检查时间 / Cron 格式后重试，或发送 /cancel 取消" }), reply_markup: renderCheckinInlineKeyboard() });
  }
}

async function continueAdminPresencePolicyFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || !["creating_admin_presence_policy_remind", "creating_admin_presence_policy_final", "creating_admin_presence_policy_hourly", "creating_admin_presence_policy_name", "editing_admin_presence_policy_name"].includes(session.state)) return null;
  if (session.state === "editing_admin_presence_policy_name") {
    const parsed = parseSessionData(session.data_json);
    const policyId = Number(parsed.policy_id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "保活策略编辑会话已失效，请重新进入策略详情。", reply_markup: renderAdminPresenceMenuKeyboard() });
    }
    try {
      const data = await new AdminPresenceService(env).updatePolicy(policyId, { name: update.text }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch {
      return client.sendMessage({ chat_id: update.chatId, text: "保活策略名称更新失败，请输入 1-64 个字符，或发送 /cancel 取消。", reply_markup: renderAdminPresencePolicyNamePromptKeyboard() });
    }
  }
  const parsed = parseSessionData(session.data_json);
  const action = typeof parsed.action === "string" ? parsed.action : "notify";
  const scope = typeof parsed.scope === "string" ? parsed.scope : "all";
  const remindAfter = typeof parsed.remind_after_minutes === "number" ? parsed.remind_after_minutes : Number(parsed.remind_after_minutes ?? 0);
  const finalAfter = typeof parsed.final_after_minutes === "number" ? parsed.final_after_minutes : Number(parsed.final_after_minutes ?? 0);
  const hourlyBefore = typeof parsed.hourly_reminder_before_minutes === "number" ? parsed.hourly_reminder_before_minutes : Number(parsed.hourly_reminder_before_minutes ?? 0);
  if (session.state === "creating_admin_presence_policy_remind" || session.state === "creating_admin_presence_policy_final" || session.state === "creating_admin_presence_policy_hourly") {
    return null;
  }
  const name = update.text.trim();
  try {
    const data = await new AdminPresenceService(env).createPolicy({ name, scope, action, enabled: true, remind_after_minutes: remindAfter || undefined, final_after_minutes: finalAfter || undefined, hourly_reminder_before_minutes: hourlyBefore || undefined }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresencePolicyCreatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
  } catch {
    return client.sendMessage({ chat_id: update.chatId, text: "保活策略创建失败，请检查名称后重试，或发送 /cancel 取消。", reply_markup: renderAdminPresencePolicyNamePromptKeyboard() });
  }
}

async function continueGroupFlow(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult | null> {
  if (!env.DB) return null;
  const session = await sessions.getCurrentSession(update.fromId);
  if (!session || !["creating_group", "renaming_group"].includes(session.state)) return null;
  const name = update.text.trim();
  try {
    const service = new GroupService(env);
    if (session.state === "creating_group") {
      const data = await service.createGroup(name, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "分组已创建", status: "success", requestId, fields: [{ label: "分组", value: data.group.name }], nextStep: "可继续添加账号到该分组，或返回分组列表" }), reply_markup: renderGroupsMenuKeyboard([data.group]) });
    }
    const parsed = parseSessionData(session.data_json);
    const groupId = Number(parsed.group_id);
    const data = await service.renameGroup(groupId, name, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "分组已重命名", status: "success", requestId, fields: [{ label: "新名称", value: data.group.name }], nextStep: "返回分组列表确认名称" }), reply_markup: renderGroupsMenuKeyboard([data.group]) });
  } catch (error) {
    const appError = error instanceof Error ? error : new Error("group flow failed");
    return client.sendMessage({ chat_id: update.chatId, text: renderTelegramOperationResult({ title: "分组操作", status: "failed", requestId, errorMessage: mapGroupFlowError(appError), nextStep: "按提示修改后重试，或发送 /cancel 取消" }), reply_markup: renderCheckinInlineKeyboard() });
  }
}

function parseScheduleCronInput(text: string): string | null {
  const trimmed = text.trim();
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${minute} ${hour} * * *`;
    }
    return null;
  }
  if (trimmed.split(/\s+/).length === 5) return trimmed;
  return null;
}

function parseSessionData(dataJson?: string | null): Record<string, unknown> {
  if (!dataJson) return {};
  try {
    const parsed = JSON.parse(dataJson);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}


function mapGroupFlowError(error: Error): string {
  if (error.message.includes("already exists")) return "分组名称已存在，请换一个名称。";
  if (error.message.includes("Default group")) return "默认分组不能重命名或删除。";
  if (error.message.includes("not empty")) return "这个分组下还有账号，请先移动账号后再删除。";
  return "请检查名称格式，1-32 字，支持中文、英文、数字、空格、下划线、短横线。";
}
