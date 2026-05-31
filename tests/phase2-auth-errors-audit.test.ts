import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { AppError } from "../src/errors/app-error";
import { ErrorCode } from "../src/errors/error-codes";
import { mapTelegramErrorMessage } from "../src/errors/telegram-error-messages";
import { isSuperAdmin, verifyApiBearerToken, verifyTelegramWebhookSecret } from "../src/middleware/auth";
import { sanitizeSensitiveText } from "../src/utils/sanitize";

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

describe("Phase 2 auth, errors, audit foundations", () => {
  it("rejects protected API requests without bearer token using unified error and request id", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/v1/audit-logs"), env as never);
    const body = await response.json() as { ok: boolean; error: { code: string; request_id: string } };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("verifies API bearer token, Telegram webhook secret, and Super Admin", async () => {
    await expect(verifyApiBearerToken(new Request("https://example.com", { headers: { Authorization: "Bearer secret-api-token" } }), env)).resolves.toBe(true);
    await expect(verifyApiBearerToken(new Request("https://example.com", { headers: { Authorization: "Bearer bot-token" } }), { ...env, API_AUTH_TOKEN: undefined })).resolves.toBe(false);
    await expect(verifyTelegramWebhookSecret(new Request("https://example.com", { headers: { "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" } }), env)).resolves.toBe(true);
    await expect(verifyTelegramWebhookSecret(new Request("https://example.com", { headers: { "X-Telegram-Bot-Api-Secret-Token": "bot-token" } }), { ...env, TELEGRAM_WEBHOOK_SECRET: undefined })).resolves.toBe(false);
    expect(isSuperAdmin(123456789, env)).toBe(true);
    expect(isSuperAdmin(987654321, env)).toBe(false);
    expect(isSuperAdmin(undefined, { ...env, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string })).toBe(false);
  });

  it("maps app errors and telegram messages", () => {
    const error = new AppError(ErrorCode.VALIDATION_ERROR, "Invalid request body", "req_abc", 400);

    expect(error.toResponseBody()).toEqual({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid request body", request_id: "req_abc" } });
    expect(mapTelegramErrorMessage(ErrorCode.FORBIDDEN)).toContain("Super Admin");
  });

  it("sanitizes bearer, Linode, Telegram and configured secret values", () => {
    const input = "Authorization: Bearer secret-api-token token=linode_abcdefghijklmnopqrstuvwxyz123456 bot123:ABCDEF telegram-secret";
    const sanitized = sanitizeSensitiveText(input, ["secret-api-token", "telegram-secret"]);

    expect(sanitized).not.toContain("secret-api-token");
    expect(sanitized).not.toContain("telegram-secret");
    expect(sanitized).not.toContain("linode_abcdefghijklmnopqrstuvwxyz123456");
    expect(sanitized).toContain("[REDACTED]");
  });
});
