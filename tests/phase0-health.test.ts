import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { createJsonResponse } from "../src/utils/json-response";

const env = {
  API_AUTH_TOKEN: "secret-api-token",
  TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  SUPER_ADMIN_TELEGRAM_ID: "123456789",
  TELEGRAM_BOT_TOKEN: "bot-token",
  LINODE_TOKEN_ENCRYPTION_KEY: "encryption-key",
  APP_TIMEZONE: "Asia/Shanghai",
  BATCH_CONCURRENCY: "5",
  OPERATION_LOG_RETENTION_DAYS: "1",
  LOGIN_EVENT_RETENTION_DAYS: "1"
};

describe("Phase 0 worker skeleton", () => {
  it("returns unified JSON and request id for GET /api/v1/health", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/v1/health"), env as never);
    const body = await response.json() as { ok: boolean; data: { service: string; version: string; time: string } };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);
    expect(body.ok).toBe(true);
    expect(body.data.service).toBe("linode-guard-lite");
    expect(body.data.version).toBe("0.1.0");
    expect(new Date(body.data.time).toString()).not.toBe("Invalid Date");
  });

  it("creates unified JSON responses with request ids", async () => {
    const response = createJsonResponse({ ok: true, data: { hello: "world" } }, { requestId: "req_test" });

    expect(response.headers.get("x-request-id")).toBe("req_test");
    expect(await response.json()).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("returns a unified 404 error for unknown protected API routes", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/v1/nope", { headers: { Authorization: "Bearer secret-api-token" } }), env as never);
    const body = await response.json() as { ok: boolean; error: { code: string; request_id: string } };

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.request_id).toBe(response.headers.get("x-request-id"));
  });
});
