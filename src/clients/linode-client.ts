import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";

export interface LinodeTokenTestResult {
  status: "valid";
  username?: string;
  instance_count: number;
  latest_login_id?: string | null;
  latest_login_at?: string | null;
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

export interface LinodePersonalAccessTokenResult {
  id?: number;
  label?: string;
  token: string;
}

interface LinodeListResponse<T> {
  data?: T[];
  page?: number;
  pages?: number;
}

const MAX_LIST_PAGES = 100;

export class LinodeClient {
  constructor(private readonly token: string) {}

  async testToken(requestId: string): Promise<LinodeTokenTestResult> {
    const accountResponse = await this.request("/account", requestId);
    const accountBody = await accountResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof accountBody.username === "string" && typeof accountBody.email !== "string") {
      return { status: "valid", username: accountBody.username, instance_count: 0, latest_login_id: null, latest_login_at: null };
    }
    const instances = await this.listInstances(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.LINODE_API_ERROR) return [];
      throw error;
    });
    const logins = await this.listAccountLogins(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.LINODE_API_ERROR) return [];
      throw error;
    });
    const latestLogin = findNewestLogin(logins);
    return { status: "valid", instance_count: instances.length, latest_login_id: latestLogin?.id ?? null, latest_login_at: latestLogin?.datetime ?? null };
  }

  async listInstances(requestId: string): Promise<LinodeInstance[]> {
    const items = await this.listAllPages("/linode/instances", requestId);
    return items.map(toLinodeInstance);
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
    const items = await this.listAllPages("/account/logins", requestId);
    return items.map(toLinodeLoginEvent);
  }

  async createPersonalAccessToken(input: { label: string; scopes?: string; expiry?: string | null }, requestId: string): Promise<LinodePersonalAccessTokenResult> {
    const response = await this.request("/profile/tokens", requestId, "POST", {
      label: input.label,
      scopes: input.scopes ?? "*",
      expiry: input.expiry ?? null
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode token creation did not return a raw token", requestId, 502);
    }
    return { id: typeof body.id === "number" ? body.id : undefined, label: typeof body.label === "string" ? body.label : input.label, token: body.token };
  }

  private async request(path: string, requestId: string, method = "GET", body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`https://api.linode.com/v4${path}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API request failed", requestId, 502);
    }

    if (response.status === 401) {
      throw new AppError(ErrorCode.TOKEN_INVALID, "Linode Token 无效或已被撤销", requestId, 401);
    }
    if (response.status === 403) {
      throw new AppError(ErrorCode.TOKEN_PERMISSION_ERROR, "Linode Token 权限不足", requestId, 403);
    }
    if (response.status === 429) {
      throw new AppError(ErrorCode.RATE_LIMITED, "Linode API 限流，请稍后重试", requestId, 429);
    }
    if (!response.ok) {
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API 请求失败", requestId, 502);
    }
    return response;
  }

  private async listAllPages(path: string, requestId: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      if (page > MAX_LIST_PAGES) {
        throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode list response exceeded safe page limit", requestId, 502);
      }

      const response = await this.request(page === 1 ? path : `${path}?page=${page}`, requestId);
      const body = await response.json().catch(() => ({})) as LinodeListResponse<Record<string, unknown>>;
      const data = Array.isArray(body.data) ? body.data : [];
      items.push(...data);

      totalPages = normalizeTotalPages(body.pages);
      if (data.length === 0 || page >= totalPages) break;
      page += 1;
    }

    return items;
  }
}

function normalizeTotalPages(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
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

function findNewestLogin(logins: LinodeLoginEvent[]): LinodeLoginEvent | null {
  let newest: LinodeLoginEvent | null = null;
  for (const login of logins) {
    const loginTime = Date.parse(login.datetime);
    const newestTime = newest ? Date.parse(newest.datetime) : Number.NEGATIVE_INFINITY;
    if (!newest || loginTime > newestTime) newest = login;
  }
  return newest;
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
