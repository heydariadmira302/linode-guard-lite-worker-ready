import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";

export interface LinodeTokenTestResult {
  status: "valid";
  username?: string;
  instance_count: number;
  latest_login_id?: string | null;
}

export interface LinodeInstance {
  id: number;
  label: string;
  status: string;
  region: string;
  type: string;
  ipv4?: string[];
  ipv6?: string;
  image?: string | null;
  created?: string;
  updated?: string;
  specs?: unknown;
  alerts?: unknown;
  backups?: unknown;
  tags?: string[];
  raw?: Record<string, unknown>;
}

export interface LinodeLoginEvent {
  id: string;
  username?: string;
  ip?: string;
  datetime: string;
  status?: string;
  raw?: Record<string, unknown>;
}

interface LinodeListResponse<T> {
  data?: T[];
}

export class LinodeClient {
  constructor(private readonly token: string) {}

  async testToken(requestId: string): Promise<LinodeTokenTestResult> {
    const accountResponse = await this.request("/account", requestId);
    const accountBody = await accountResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof accountBody.username === "string" && typeof accountBody.email !== "string") {
      return { status: "valid", username: accountBody.username, instance_count: 0, latest_login_id: null };
    }
    const instances = await this.listInstances(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.LINODE_API_ERROR) return [];
      throw error;
    });
    const logins = await this.listAccountLogins(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.LINODE_API_ERROR) return [];
      throw error;
    });
    const latestLoginId = logins.length > 0 ? logins[0].id : null;
    return { status: "valid", instance_count: instances.length, latest_login_id: latestLoginId };
  }

  async listInstances(requestId: string): Promise<LinodeInstance[]> {
    const response = await this.request("/linode/instances", requestId);
    const body = await response.json().catch(() => ({})) as LinodeListResponse<Record<string, unknown>>;
    return (body.data ?? []).map(toLinodeInstance);
  }

  async getInstance(instanceId: number, requestId: string): Promise<LinodeInstance> {
    const response = await this.request(`/linode/instances/${instanceId}`, requestId);
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return toLinodeInstance(body);
  }

  async bootInstance(instanceId: number, requestId: string): Promise<void> {
    await this.request(`/linode/instances/${instanceId}/boot`, requestId, "POST");
  }

  async shutdownInstance(instanceId: number, requestId: string): Promise<void> {
    await this.request(`/linode/instances/${instanceId}/shutdown`, requestId, "POST");
  }

  async rebootInstance(instanceId: number, requestId: string): Promise<void> {
    await this.request(`/linode/instances/${instanceId}/reboot`, requestId, "POST");
  }

  async deleteInstance(instanceId: number, requestId: string): Promise<void> {
    await this.request(`/linode/instances/${instanceId}`, requestId, "DELETE");
  }

  async listAccountLogins(requestId: string): Promise<LinodeLoginEvent[]> {
    const response = await this.request("/account/logins", requestId);
    const body = await response.json().catch(() => ({})) as LinodeListResponse<Record<string, unknown>>;
    return (body.data ?? []).map(toLinodeLoginEvent);
  }

  private async request(path: string, requestId: string, method = "GET"): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`https://api.linode.com/v4${path}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`
        }
      });
    } catch {
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API request failed", requestId, 502);
    }

    if (response.status === 401) {
      throw new AppError(ErrorCode.TOKEN_INVALID, "Linode Token is invalid", requestId, 401);
    }
    if (response.status === 403) {
      throw new AppError(ErrorCode.TOKEN_PERMISSION_ERROR, "Linode Token permission is insufficient", requestId, 403);
    }
    if (!response.ok) {
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API error", requestId, 502);
    }
    return response;
  }
}

function toLinodeInstance(raw: Record<string, unknown>): LinodeInstance {
  return {
    id: Number(raw.id),
    label: String(raw.label ?? ""),
    status: String(raw.status ?? "unknown"),
    region: String(raw.region ?? ""),
    type: String(raw.type ?? ""),
    ipv4: Array.isArray(raw.ipv4) ? raw.ipv4.map(String) : undefined,
    ipv6: typeof raw.ipv6 === "string" ? raw.ipv6 : undefined,
    image: typeof raw.image === "string" || raw.image === null ? raw.image as string | null : undefined,
    created: typeof raw.created === "string" ? raw.created : undefined,
    updated: typeof raw.updated === "string" ? raw.updated : undefined,
    specs: raw.specs,
    alerts: raw.alerts,
    backups: raw.backups,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    raw
  };
}

function toLinodeLoginEvent(raw: Record<string, unknown>): LinodeLoginEvent {
  return {
    id: String(raw.id),
    username: typeof raw.username === "string" ? raw.username : undefined,
    ip: typeof raw.ip === "string" ? raw.ip : undefined,
    datetime: typeof raw.datetime === "string" ? raw.datetime : new Date().toISOString(),
    status: typeof raw.status === "string" ? raw.status : undefined,
    raw
  };
}
