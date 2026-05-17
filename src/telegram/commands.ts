import type { TelegramClient } from "../clients/telegram-client";
import type { Env } from "../env";
import type { BotSessionService } from "../services/bot-session-service";
import { AdminPresenceService } from "../services/admin-presence-service";
import { DiagnosticsService } from "../services/setup-service";
import { ScheduleService } from "../services/schedule-service";
import type { ParsedTelegramUpdate, TelegramClientAction, TelegramClientResult } from "./types";
import { continueAddAccountFlow } from "./account-flow";
import { AccountService } from "../services/account-service";
import { renderCheckinInlineKeyboard, renderMainReplyKeyboard } from "./keyboards";
import { renderAccountActionResultText, renderAccountDetailKeyboard, renderAccountsMenuKeyboard, renderAccountsMenuText, renderDiagnosticsMenuKeyboard, renderDiagnosticsMenuText, renderHelpText, renderMainMenuKeyboard, renderMainMenuText, renderSettingsMenuKeyboard, renderSettingsMenuText } from "./menus";
import { renderInstancesMenuKeyboard, renderInstancesMenuText } from "./instance-renderer";
import { GroupService } from "../services/group-service";
import { renderGroupSelectKeyboard, renderGroupSelectText, renderGroupsMenuKeyboard, renderGroupsMenuText } from "./group-renderer";
import { renderSetupWizardText } from "./setup-renderer";
import { renderAdminPresenceMenuKeyboard, renderAdminPresenceMenuText, renderAdminPresencePolicyCreatedText, renderAdminPresencePolicyDetailKeyboard, renderAdminPresencePolicyNamePrompt, renderAdminPresencePolicyTimeKeyboard, renderAdminPresencePolicyTimeText, renderAdminPresencePolicyUpdatedText } from "./admin-presence-renderer";
import { renderScheduleActionResultKeyboard, renderScheduleActionResultText, renderSchedulesMenuKeyboard, renderSchedulesMenuText } from "./schedule-renderer";
import { renderSecurityMenuKeyboard, renderSecurityMenuText } from "./security-renderer";
import { SecurityService } from "../services/security-service";

export async function handleTelegramMessageCommand(
  update: Extract<ParsedTelegramUpdate, { kind: "message" }>,
  client: TelegramClient,
  sessions: Pick<BotSessionService, "clearCurrentSession" | "getCurrentSession" | "setCurrentSession">,
  env: Env,
  requestId: string
): Promise<TelegramClientResult> {
  if (!update.command) {
    if (update.text === "🏠 主菜单" || update.text === "主菜单") {
      await sessions.clearCurrentSession(update.fromId);
      return [
        client.sendMessage({ chat_id: update.chatId, text: "主入口按钮已放到聊天框下方。", reply_markup: renderMainReplyKeyboard() }) as TelegramClientAction,
        client.sendMessage({ chat_id: update.chatId, text: renderMainMenuText(), reply_markup: renderCheckinInlineKeyboard() }) as TelegramClientAction
      ];
    }
    if (update.text === "🖥 服务器" || update.text === "服务器") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderInstancesMenuText(), reply_markup: renderInstancesMenuKeyboard() });
    }
    if (update.text === "👤 账号" || update.text === "账号") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAccountsMenuText(), reply_markup: renderAccountsMenuKeyboard() });
    }
    if (update.text === "📁 分组" || update.text === "分组") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new GroupService(env).listGroups();
        return client.sendMessage({ chat_id: update.chatId, text: renderGroupsMenuText(data.groups), reply_markup: renderGroupsMenuKeyboard(data.groups) });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "分组功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "🛡 安全事件" || update.text === "安全事件") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new SecurityService(env).getOverview();
        return client.sendMessage({ chat_id: update.chatId, text: renderSecurityMenuText(data.open_events, data.recent_events), reply_markup: renderSecurityMenuKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "安全事件功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "⏰ 定时任务" || update.text === "定时任务") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderSchedulesMenuText(), reply_markup: renderSchedulesMenuKeyboard() });
    }
    if (update.text === "❤️ 保活打卡" || update.text === "保活打卡") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new AdminPresenceService(env).getStatus();
        return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresenceMenuText(data), reply_markup: renderAdminPresenceMenuKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "保活打卡功能需要数据库支持。", reply_markup: renderCheckinInlineKeyboard() });
    }
    if (update.text === "⚙️ 设置" || update.text === "设置") {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderSettingsMenuText(), reply_markup: renderSettingsMenuKeyboard() });
    }
    if (update.text === "系统自检") {
      await sessions.clearCurrentSession(update.fromId);
      const diagnostics = new DiagnosticsService(env);
      const deployment = await diagnostics.getDeploymentDiagnostics();
      const jobs = await diagnostics.getJobsDiagnostics();
      return client.sendMessage({ chat_id: update.chatId, text: renderDiagnosticsMenuText(deployment.status, jobs.missing, jobs.disabled), reply_markup: renderDiagnosticsMenuKeyboard() });
    }
    if (update.text === "❤️ 打卡" || update.text === "打卡") {
      await sessions.clearCurrentSession(update.fromId);
      if (env.DB) {
        const data = await new AdminPresenceService(env).checkin({ requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
        return client.sendMessage({ chat_id: update.chatId, text: ["✅ 打卡成功", "", `最近确认时间：${data.status.last_checkin_at ?? "-"}`].join("\n"), reply_markup: renderCheckinInlineKeyboard() });
      }
      return client.sendMessage({ chat_id: update.chatId, text: "请点击下方按钮完成打卡。", reply_markup: renderCheckinInlineKeyboard() });
    }
    const accountTokenFlowResult = await continueAccountTokenUpdateFlow(update, client, sessions, env, requestId);
    if (accountTokenFlowResult) return accountTokenFlowResult;
    const scheduleFlowResult = await continueScheduleFlow(update, client, sessions, env, requestId);
    if (scheduleFlowResult) return scheduleFlowResult;
    const adminPresenceFlowResult = await continueAdminPresencePolicyFlow(update, client, sessions, env, requestId);
    if (adminPresenceFlowResult) return adminPresenceFlowResult;
    const groupFlowResult = await continueGroupFlow(update, client, sessions, env, requestId);
    if (groupFlowResult) return groupFlowResult;
    const flowResult = await continueAddAccountFlow(update, client, sessions, env, requestId);
    if (flowResult) return flowResult;
  }

  switch (update.command) {
    case "start":
      return [
        client.sendMessage({ chat_id: update.chatId, text: "主入口按钮已放到聊天框下方。", reply_markup: renderMainReplyKeyboard() }) as TelegramClientAction,
        client.sendMessage({ chat_id: update.chatId, text: renderMainMenuText(), reply_markup: renderMainMenuKeyboard() }) as TelegramClientAction
      ];
    case "help":
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
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
      const accountTokenFlowResult = await continueAccountTokenUpdateFlow(update, client, sessions, env, requestId);
      if (accountTokenFlowResult) return accountTokenFlowResult;
      const scheduleFlowResult = await continueScheduleFlow(update, client, sessions, env, requestId);
      if (scheduleFlowResult) return scheduleFlowResult;
      const adminPresenceFlowResult = await continueAdminPresencePolicyFlow(update, client, sessions, env, requestId);
      if (adminPresenceFlowResult) return adminPresenceFlowResult;
      const groupFlowResult = await continueGroupFlow(update, client, sessions, env, requestId);
      if (groupFlowResult) return groupFlowResult;
      const flowResult = await continueAddAccountFlow(update, client, sessions, env, requestId);
      if (flowResult) return flowResult;
      return client.sendMessage({ chat_id: update.chatId, text: renderHelpText() });
    }
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
    actions.push(client.sendMessage({ chat_id: update.chatId, text: "Token 更新失败：请检查 Token 是否完整、权限是否足够，然后重新发送；或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() }) as TelegramClientAction);
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
  const action = parsed.action === "boot" || parsed.action === "shutdown" ? parsed.action : null;
  const scope = parsed.scope === "account" ? "account" : parsed.scope === "group" ? "group" : parsed.scope === "all" ? "all" : null;
  const accountId = scope === "account" ? Number(parsed.account_id) : null;
  const groupId = scope === "group" ? Number(parsed.group_id) : null;
  if (!action || !scope || (scope === "account" && (!Number.isInteger(accountId) || Number(accountId) <= 0)) || (scope === "group" && (!Number.isInteger(groupId) || Number(groupId) <= 0))) {
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: "定时任务会话已失效，请重新创建。", reply_markup: renderCheckinInlineKeyboard() });
  }
  const resolvedAccountId = scope === "account" ? Number(accountId) : null;
  const resolvedGroupId = scope === "group" ? Number(groupId) : null;
  const cronExpr = parseScheduleCronInput(update.text.trim());
  if (!cronExpr) {
    return client.sendMessage({ chat_id: update.chatId, text: "时间格式不正确。请发送 09:30、22:00，或 5 段 Cron，例如：30 9 * * *。发送 /cancel 可取消。", reply_markup: renderCheckinInlineKeyboard() });
  }
  try {
    const data = await new ScheduleService(env).createSchedule({
      name: `自定义 ${scope === "account" ? `账号 #${resolvedAccountId} ` : scope === "group" ? `分组 #${resolvedGroupId} ` : ""}${action === "boot" ? "开机" : "关机"}`,
      action,
      scope,
      account_id: resolvedAccountId,
      group_id: resolvedGroupId,
      cron_expr: cronExpr,
      timezone: env.APP_TIMEZONE ?? "Asia/Shanghai",
      enabled: true
    }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderScheduleActionResultText("created", data.schedule), reply_markup: renderScheduleActionResultKeyboard() });
  } catch {
    return client.sendMessage({ chat_id: update.chatId, text: "定时任务创建失败，请检查时间 / Cron 格式后重试，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
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
  if (!session || !["creating_admin_presence_policy_remind", "creating_admin_presence_policy_final", "creating_admin_presence_policy_name", "editing_admin_presence_policy_name"].includes(session.state)) return null;
  if (session.state === "editing_admin_presence_policy_name") {
    const parsed = parseSessionData(session.data_json);
    const policyId = Number(parsed.policy_id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: "保活策略编辑会话已失效，请重新进入策略详情。", reply_markup: renderCheckinInlineKeyboard() });
    }
    try {
      const data = await new AdminPresenceService(env).updatePolicy(policyId, { name: update.text }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresencePolicyUpdatedText(data.policy), reply_markup: renderAdminPresencePolicyDetailKeyboard(data.policy) });
    } catch {
      return client.sendMessage({ chat_id: update.chatId, text: "保活策略名称更新失败，请输入 1-64 个字符，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
    }
  }
  const parsed = parseSessionData(session.data_json);
  const action = typeof parsed.action === "string" ? parsed.action : "notify";
  const scope = typeof parsed.scope === "string" ? parsed.scope : "all";
  const remindAfter = typeof parsed.remind_after_minutes === "number" ? parsed.remind_after_minutes : Number(parsed.remind_after_minutes ?? 0);
  const finalAfter = typeof parsed.final_after_minutes === "number" ? parsed.final_after_minutes : Number(parsed.final_after_minutes ?? 0);
  if (session.state === "creating_admin_presence_policy_remind" || session.state === "creating_admin_presence_policy_final") {
    return null;
  }
  const name = update.text.trim();
  try {
    const data = await new AdminPresenceService(env).createPolicy({ name, scope, action, enabled: true, remind_after_minutes: remindAfter || undefined, final_after_minutes: finalAfter || undefined }, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: renderAdminPresencePolicyCreatedText(data.policy), reply_markup: renderCheckinInlineKeyboard() });
  } catch {
    return client.sendMessage({ chat_id: update.chatId, text: "保活策略创建失败，请检查名称后重试，或发送 /cancel 取消。", reply_markup: renderCheckinInlineKeyboard() });
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
  if (!session || !["creating_group", "creating_group_from_account", "renaming_group"].includes(session.state)) return null;
  const name = update.text.trim();
  try {
    const service = new GroupService(env);
    if (session.state === "creating_group") {
      const data = await service.createGroup(name, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: [`✅ 分组已创建`, "", `分组：${data.group.name}`].join("\n"), reply_markup: renderGroupsMenuKeyboard([data.group]) });
    }
    if (session.state === "creating_group_from_account") {
      const parsed = parseSessionData(session.data_json);
      const alias = typeof parsed.alias === "string" ? parsed.alias : undefined;
      const data = await service.createGroup(name, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
      const groups = await service.listGroups();
      if (alias) {
        await sessions.setCurrentSession({ telegramUserId: update.fromId, chatId: update.chatId, state: "adding_account_group", data: { alias } });
        return client.sendMessage({ chat_id: update.chatId, text: [`✅ 分组已创建`, "", `分组：${data.group.name}`, "", "请选择账号所属分组："].join("\n"), reply_markup: renderGroupSelectKeyboard(groups.groups, alias) });
      }
      await sessions.clearCurrentSession(update.fromId);
      return client.sendMessage({ chat_id: update.chatId, text: [`✅ 分组已创建`, "", `分组：${data.group.name}`].join("\n"), reply_markup: renderGroupsMenuKeyboard([data.group]) });
    }
    const parsed = parseSessionData(session.data_json);
    const groupId = Number(parsed.group_id);
    const data = await service.renameGroup(groupId, name, { requestId, actor: `telegram:${update.fromId}`, source: "telegram" });
    await sessions.clearCurrentSession(update.fromId);
    return client.sendMessage({ chat_id: update.chatId, text: [`✅ 分组已重命名`, "", `新名称：${data.group.name}`].join("\n"), reply_markup: renderGroupsMenuKeyboard([data.group]) });
  } catch (error) {
    const appError = error instanceof Error ? error : new Error("group flow failed");
    return client.sendMessage({ chat_id: update.chatId, text: `操作失败：${mapGroupFlowError(appError)}`, reply_markup: renderCheckinInlineKeyboard() });
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
