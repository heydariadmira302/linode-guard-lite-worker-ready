import type { Env } from "./env";
import { AppError } from "./errors/app-error";
import { ErrorCode } from "./errors/error-codes";
import { verifyApiBearerToken } from "./middleware/auth";
import { getRuntimeSecrets } from "./services/runtime-secret-service";
import { handleCreateAccount, handleDeleteAccount, handleGetAccount, handleListAccounts, handleTestAccount, handleUpdateAccountToken } from "./api/accounts";
import { handleCreateGroup, handleDeleteGroup, handleListGroups, handleMoveAccountToGroup, handleRenameGroup } from "./api/groups";
import { handleListAuditLogs } from "./api/audit-logs";
import { handleAddProtectedInstance, handleGetAppSettings, handleRemoveProtectedInstance, handleUpdateAppSettings } from "./api/app-settings";
import { handleAccountBatch, handleAllAccountsBatch, handleGroupBatch } from "./api/batch";
import { handleDeploymentDiagnostics, handleJobsDiagnostics, handleSetupInitialize, handleSetupSchema } from "./api/diagnostics";
import { handleBootAccountInstance, handleCreateAccountInstance, handleDeleteAccountInstance, handleGetAccountInstance, handleGetCreateInstanceOptions, handleListAccountInstances, handleListAllInstances, handleRebootAccountInstance, handleShutdownAccountInstance } from "./api/instances";
import { handleHealth } from "./api/health";
import { handleAdminPresenceCheckin, handleAdminPresenceStatus, handleCreateAdminPresencePolicy, handleDeleteAdminPresencePolicy, handleDisableAdminPresencePolicy, handleEnableAdminPresencePolicy, handleGetAdminPresencePolicy, handleListAdminPresencePolicies, handleUpdateAdminPresencePolicy } from "./api/admin-presence";
import { handleConfirmSecurityEvent, handleGenerateLinodeToken, handleGetSecuritySettings, handleListSecurityEvents, handleMarkSecurityEventSuspicious, handleSecurityCheck, handleUpdateSecuritySettings } from "./api/security";
import { handleCreateSchedule, handleDeleteSchedule, handleDisableAllSchedules, handleDisableSchedule, handleEnableAllSchedules, handleEnableSchedule, handleListSchedules, handleUpdateSchedule } from "./api/schedules";
import { handleSetupPage } from "./api/setup-page";
import { handleTelegramWebhook } from "./telegram/webhook";
import { createErrorResponse, createJsonResponse } from "./utils/json-response";

export async function routeRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/api/v1/health") return handleHealth(request, env, requestId);
    if (request.method === "GET" && url.pathname === "/setup") return handleSetupPage(request);
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return await handleTelegramWebhook(request, env, requestId);
    if (url.pathname.startsWith("/api/v1/")) {
      const isBootstrapSetupRoute = await shouldAllowBootstrapSetup(request, env);
      if (!isBootstrapSetupRoute && !(await verifyApiBearerToken(request, env))) {
        throw new AppError(ErrorCode.UNAUTHORIZED, "Missing or invalid API bearer token", requestId, 401);
      }
      if (request.method === "GET" && url.pathname === "/api/v1/diagnostics/deployment") return await handleDeploymentDiagnostics(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/diagnostics/jobs") return await handleJobsDiagnostics(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/setup/schema") return await handleSetupSchema(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/setup/initialize") return await handleSetupInitialize(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/accounts") return await handleListAccounts(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/accounts") return await handleCreateAccount(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/groups") return await handleListGroups(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/groups") return await handleCreateGroup(request, env, requestId);
      const groupAccountMoveMatch = url.pathname.match(/^\/api\/v1\/groups\/(\d+)\/accounts\/(\d+)$/);
      if (request.method === "POST" && groupAccountMoveMatch) return await handleMoveAccountToGroup(request, env, requestId, Number(groupAccountMoveMatch[1]), Number(groupAccountMoveMatch[2]));
      const groupBatchMatch = url.pathname.match(/^\/api\/v1\/groups\/(\d+)\/instances\/batch\/(boot|shutdown|delete)$/);
      if (request.method === "POST" && groupBatchMatch) return await handleGroupBatch(request, env, requestId, Number(groupBatchMatch[1]), groupBatchMatch[2] as "boot" | "shutdown" | "delete");
      const groupMatch = url.pathname.match(/^\/api\/v1\/groups\/(\d+)$/);
      if (request.method === "PATCH" && groupMatch) return await handleRenameGroup(request, env, requestId, Number(groupMatch[1]));
      if (request.method === "DELETE" && groupMatch) return await handleDeleteGroup(request, env, requestId, Number(groupMatch[1]));
      if (request.method === "GET" && url.pathname === "/api/v1/audit-logs") return await handleListAuditLogs(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/security/settings") return await handleGetSecuritySettings(request, env, requestId);
      if (request.method === "PATCH" && url.pathname === "/api/v1/security/settings") return await handleUpdateSecuritySettings(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/app/settings") return await handleGetAppSettings(request, env, requestId);
      if (request.method === "PATCH" && url.pathname === "/api/v1/app/settings") return await handleUpdateAppSettings(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/app/protected-instances") return await handleAddProtectedInstance(request, env, requestId);
      const protectedInstanceDeleteMatch = url.pathname.match(/^\/api\/v1\/app\/protected-instances\/(\d+)$/);
      if (request.method === "DELETE" && protectedInstanceDeleteMatch) return await handleRemoveProtectedInstance(request, env, requestId, Number(protectedInstanceDeleteMatch[1]));
      const securityGenerateTokenMatch = url.pathname.match(/^\/api\/v1\/security\/accounts\/(\d+)\/generate-token$/);
      if (request.method === "POST" && securityGenerateTokenMatch) return await handleGenerateLinodeToken(request, env, requestId, Number(securityGenerateTokenMatch[1]));
      if (request.method === "GET" && url.pathname === "/api/v1/security/events") return await handleListSecurityEvents(request, env, requestId);
      const securityEventActionMatch = url.pathname.match(/^\/api\/v1\/security\/events\/(\d+)\/(confirm|mark-suspicious)$/);
      if (request.method === "POST" && securityEventActionMatch && securityEventActionMatch[2] === "confirm") return await handleConfirmSecurityEvent(request, env, requestId, Number(securityEventActionMatch[1]));
      if (request.method === "POST" && securityEventActionMatch && securityEventActionMatch[2] === "mark-suspicious") return await handleMarkSecurityEventSuspicious(request, env, requestId, Number(securityEventActionMatch[1]));
      if (request.method === "POST" && url.pathname === "/api/v1/security/check") return await handleSecurityCheck(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/schedules") return await handleListSchedules(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/schedules") return await handleCreateSchedule(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/schedules/enable-all") return await handleEnableAllSchedules(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/schedules/disable-all") return await handleDisableAllSchedules(request, env, requestId);
      const scheduleActionMatch = url.pathname.match(/^\/api\/v1\/schedules\/(\d+)\/(enable|disable)$/);
      if (request.method === "POST" && scheduleActionMatch && scheduleActionMatch[2] === "enable") return await handleEnableSchedule(request, env, requestId, Number(scheduleActionMatch[1]));
      if (request.method === "POST" && scheduleActionMatch && scheduleActionMatch[2] === "disable") return await handleDisableSchedule(request, env, requestId, Number(scheduleActionMatch[1]));
      const scheduleDeleteMatch = url.pathname.match(/^\/api\/v1\/schedules\/(\d+)$/);
      if (request.method === "PATCH" && scheduleDeleteMatch) return await handleUpdateSchedule(request, env, requestId, Number(scheduleDeleteMatch[1]));
      if (request.method === "DELETE" && scheduleDeleteMatch) return await handleDeleteSchedule(request, env, requestId, Number(scheduleDeleteMatch[1]));
      if (request.method === "GET" && url.pathname === "/api/v1/admin-presence/status") return await handleAdminPresenceStatus(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/admin-presence/checkin") return await handleAdminPresenceCheckin(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/admin-presence/policies") return await handleListAdminPresencePolicies(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/admin-presence/policies") return await handleCreateAdminPresencePolicy(request, env, requestId);
      const adminPresencePolicyGetMatch = url.pathname.match(/^\/api\/v1\/admin-presence\/policies\/(\d+)$/);
      if (request.method === "GET" && adminPresencePolicyGetMatch) return await handleGetAdminPresencePolicy(request, env, requestId, Number(adminPresencePolicyGetMatch[1]));
      if (request.method === "PATCH" && adminPresencePolicyGetMatch) return await handleUpdateAdminPresencePolicy(request, env, requestId, Number(adminPresencePolicyGetMatch[1]));
      const adminPresencePolicyActionMatch = url.pathname.match(/^\/api\/v1\/admin-presence\/policies\/(\d+)\/(enable|disable)$/);
      if (request.method === "POST" && adminPresencePolicyActionMatch && adminPresencePolicyActionMatch[2] === "enable") return await handleEnableAdminPresencePolicy(request, env, requestId, Number(adminPresencePolicyActionMatch[1]));
      if (request.method === "POST" && adminPresencePolicyActionMatch && adminPresencePolicyActionMatch[2] === "disable") return await handleDisableAdminPresencePolicy(request, env, requestId, Number(adminPresencePolicyActionMatch[1]));
      const adminPresencePolicyDeleteMatch = url.pathname.match(/^\/api\/v1\/admin-presence\/policies\/(\d+)$/);
      if (request.method === "DELETE" && adminPresencePolicyDeleteMatch) return await handleDeleteAdminPresencePolicy(request, env, requestId, Number(adminPresencePolicyDeleteMatch[1]));
      if (request.method === "GET" && url.pathname === "/api/v1/instances") return await handleListAllInstances(request, env, requestId);
      const allBatchMatch = url.pathname.match(/^\/api\/v1\/instances\/batch\/(boot|shutdown|delete)$/);
      if (request.method === "POST" && allBatchMatch) return await handleAllAccountsBatch(request, env, requestId, allBatchMatch[1] as "boot" | "shutdown" | "delete");
      const accountBatchMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/batch\/(boot|shutdown|delete)$/);
      if (request.method === "POST" && accountBatchMatch) return await handleAccountBatch(request, env, requestId, Number(accountBatchMatch[1]), accountBatchMatch[2] as "boot" | "shutdown" | "delete");
      const accountCreateOptionsMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/create-options$/);
      if (request.method === "GET" && accountCreateOptionsMatch) return await handleGetCreateInstanceOptions(request, env, requestId, Number(accountCreateOptionsMatch[1]));
      const accountCreateInstanceMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances$/);
      if (request.method === "POST" && accountCreateInstanceMatch) return await handleCreateAccountInstance(request, env, requestId, Number(accountCreateInstanceMatch[1]));
      const accountInstanceBootMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/(\d+)\/boot$/);
      if (request.method === "POST" && accountInstanceBootMatch) return await handleBootAccountInstance(request, env, requestId, Number(accountInstanceBootMatch[1]), Number(accountInstanceBootMatch[2]));
      const accountInstanceShutdownMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/(\d+)\/shutdown$/);
      if (request.method === "POST" && accountInstanceShutdownMatch) return await handleShutdownAccountInstance(request, env, requestId, Number(accountInstanceShutdownMatch[1]), Number(accountInstanceShutdownMatch[2]));
      const accountInstanceRebootMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/(\d+)\/reboot$/);
      if (request.method === "POST" && accountInstanceRebootMatch) return await handleRebootAccountInstance(request, env, requestId, Number(accountInstanceRebootMatch[1]), Number(accountInstanceRebootMatch[2]));
      const accountInstanceDetailMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances\/(\d+)$/);
      if (request.method === "DELETE" && accountInstanceDetailMatch) return await handleDeleteAccountInstance(request, env, requestId, Number(accountInstanceDetailMatch[1]), Number(accountInstanceDetailMatch[2]));
      if (request.method === "GET" && accountInstanceDetailMatch) return await handleGetAccountInstance(request, env, requestId, Number(accountInstanceDetailMatch[1]), Number(accountInstanceDetailMatch[2]));
      const accountInstancesMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/instances$/);
      if (request.method === "GET" && accountInstancesMatch) return await handleListAccountInstances(request, env, requestId, Number(accountInstancesMatch[1]));
      const accountTokenMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/token$/);
      if (request.method === "PUT" && accountTokenMatch) return await handleUpdateAccountToken(request, env, requestId, Number(accountTokenMatch[1]));
      const accountTestMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/test$/);
      if (request.method === "POST" && accountTestMatch) return await handleTestAccount(request, env, requestId, Number(accountTestMatch[1]));
      const accountDeleteMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)$/);
      if (request.method === "GET" && accountDeleteMatch) return await handleGetAccount(request, env, requestId, Number(accountDeleteMatch[1]));
      if (request.method === "DELETE" && accountDeleteMatch) return await handleDeleteAccount(request, env, requestId, Number(accountDeleteMatch[1]));
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Route not found", requestId, 404);
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Route not found", requestId, 404);
  } catch (error) {
    if (error instanceof AppError) return createErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return createErrorResponse(new AppError(ErrorCode.JOB_FAILED, message, requestId, 500));
  }
}

async function shouldAllowBootstrapSetup(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  if (request.method !== "POST" || !["/api/v1/setup/schema", "/api/v1/setup/initialize"].includes(url.pathname)) return false;
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  if (typeof env.API_AUTH_TOKEN === "string" && env.API_AUTH_TOKEN.trim().length > 0) return false;

  try {
    const secrets = await getRuntimeSecrets(env);
    if (secrets.api_auth_token) return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("no such table: settings")) throw error;
  }

  return request.headers.get("Authorization") === `Bearer ${env.TELEGRAM_BOT_TOKEN}`;
}
