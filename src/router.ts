import type { Env } from "./env";
import { AppError } from "./errors/app-error";
import { ErrorCode } from "./errors/error-codes";
import { verifyApiBearerToken } from "./middleware/auth";
import { getRuntimeSecrets } from "./services/runtime-secret-service";
import { handleCreateAccount, handleDeleteAccount, handleListAccounts, handleTestAccount } from "./api/accounts";
import { handleListAuditLogs } from "./api/audit-logs";
import { handleAccountBatch, handleAllAccountsBatch } from "./api/batch";
import { handleDeploymentDiagnostics, handleJobsDiagnostics, handleSetupInitialize, handleSetupSchema } from "./api/diagnostics";
import { handleBootAccountInstance, handleDeleteAccountInstance, handleGetAccountInstance, handleListAccountInstances, handleListAllInstances, handleRebootAccountInstance, handleShutdownAccountInstance } from "./api/instances";
import { handleHealth } from "./api/health";
import { handleAdminPresenceCheckin, handleAdminPresenceStatus, handleCreateAdminPresencePolicy, handleDeleteAdminPresencePolicy, handleDisableAdminPresencePolicy, handleEnableAdminPresencePolicy, handleListAdminPresencePolicies } from "./api/admin-presence";
import { handleConfirmSecurityEvent, handleListSecurityEvents, handleMarkSecurityEventSuspicious, handleSecurityCheck } from "./api/security";
import { handleCreateSchedule, handleDeleteSchedule, handleDisableSchedule, handleEnableSchedule, handleListSchedules } from "./api/schedules";
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
      if (request.method === "GET" && url.pathname === "/api/v1/audit-logs") return await handleListAuditLogs(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/security/events") return await handleListSecurityEvents(request, env, requestId);
      const securityEventActionMatch = url.pathname.match(/^\/api\/v1\/security\/events\/(\d+)\/(confirm|mark-suspicious)$/);
      if (request.method === "POST" && securityEventActionMatch && securityEventActionMatch[2] === "confirm") return await handleConfirmSecurityEvent(request, env, requestId, Number(securityEventActionMatch[1]));
      if (request.method === "POST" && securityEventActionMatch && securityEventActionMatch[2] === "mark-suspicious") return await handleMarkSecurityEventSuspicious(request, env, requestId, Number(securityEventActionMatch[1]));
      if (request.method === "POST" && url.pathname === "/api/v1/security/check") return await handleSecurityCheck(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/schedules") return await handleListSchedules(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/schedules") return await handleCreateSchedule(request, env, requestId);
      const scheduleActionMatch = url.pathname.match(/^\/api\/v1\/schedules\/(\d+)\/(enable|disable)$/);
      if (request.method === "POST" && scheduleActionMatch && scheduleActionMatch[2] === "enable") return await handleEnableSchedule(request, env, requestId, Number(scheduleActionMatch[1]));
      if (request.method === "POST" && scheduleActionMatch && scheduleActionMatch[2] === "disable") return await handleDisableSchedule(request, env, requestId, Number(scheduleActionMatch[1]));
      const scheduleDeleteMatch = url.pathname.match(/^\/api\/v1\/schedules\/(\d+)$/);
      if (request.method === "DELETE" && scheduleDeleteMatch) return await handleDeleteSchedule(request, env, requestId, Number(scheduleDeleteMatch[1]));
      if (request.method === "GET" && url.pathname === "/api/v1/admin-presence/status") return await handleAdminPresenceStatus(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/admin-presence/checkin") return await handleAdminPresenceCheckin(request, env, requestId);
      if (request.method === "GET" && url.pathname === "/api/v1/admin-presence/policies") return await handleListAdminPresencePolicies(request, env, requestId);
      if (request.method === "POST" && url.pathname === "/api/v1/admin-presence/policies") return await handleCreateAdminPresencePolicy(request, env, requestId);
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
      const accountTestMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)\/test$/);
      if (request.method === "POST" && accountTestMatch) return await handleTestAccount(request, env, requestId, Number(accountTestMatch[1]));
      const accountDeleteMatch = url.pathname.match(/^\/api\/v1\/accounts\/(\d+)$/);
      if (request.method === "DELETE" && accountDeleteMatch) return await handleDeleteAccount(request, env, requestId, Number(accountDeleteMatch[1]));
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Route not found", requestId, 404);
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Route not found", requestId, 404);
  } catch (error) {
    if (error instanceof AppError) return createErrorResponse(error);
    return createErrorResponse(new AppError(ErrorCode.JOB_FAILED, "Internal server error", requestId, 500));
  }
}

async function shouldAllowBootstrapSetup(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  if (request.method !== "POST" || !["/api/v1/setup/schema", "/api/v1/setup/initialize"].includes(url.pathname)) return false;
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const secrets = await getRuntimeSecrets(env);
  if (secrets.api_auth_token) return false;
  return request.headers.get("Authorization") === `Bearer ${env.TELEGRAM_BOT_TOKEN}`;
}
