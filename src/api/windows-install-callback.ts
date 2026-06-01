import type { Env } from "../env";
import { WindowsInstallMonitorService } from "../services/windows-install-monitor-service";
import { createJsonResponse } from "../utils/json-response";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";

export async function handleWindowsInstallCallback(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { token?: string; ip_address?: string; rdp_port?: number; status?: string; message?: string };
  if (typeof body.token !== "string") throw new AppError(ErrorCode.UNAUTHORIZED, "Missing Windows install callback token", requestId, 401);
  const result = await new WindowsInstallMonitorService(env).handleCallback({ token: body.token, ip_address: body.ip_address, rdp_port: body.rdp_port, status: body.status, message: body.message }, requestId);
  return createJsonResponse({ ok: true, data: { install_id: result.record.id, status: result.record.status, notified: result.notified } }, { requestId });
}
