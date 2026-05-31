import { describe, expect, it } from "vitest";
import { encodePolicyAction, encodePolicyScope, encodeScheduleAction, encodeScheduleScope, expandCompactCallbackData } from "../src/telegram/callback-codec";

function expectFitsTelegramLimit(value: string): void {
  expect(Buffer.byteLength(value)).toBeLessThanOrEqual(64);
}

describe("Phase 21 compact Telegram callback codec", () => {
  it("round-trips compact admin presence callbacks and keeps dangerous actions under Telegram's 64-byte limit", () => {
    const samples = [
      ["ap:ca:720:d", "admin_presence:policy:create_action_after_remind:720:delete_all_instances"],
      ["ap:cs:720:d:a", "admin_presence:policy:create_scope_after_remind:720:delete_all_instances:all"],
      ["ap:cua:720:d:12345678901234567890", "admin_presence:policy:create_account_after_remind:720:delete_all_instances:12345678901234567890"],
      ["ap:cga:720:d:12345678901234567890", "admin_presence:policy:create_group_after_remind:720:delete_all_instances:12345678901234567890"],
      ["ap:cf:d:g12345678901234567890:720:1440", "admin_presence:policy:create_final:delete_all_instances:group:12345678901234567890:720:1440"],
      ["ap:ch:d:g12345678901234567890:720:1440:360", "admin_presence:policy:create_hourly:delete_all_instances:group:12345678901234567890:720:1440:360"],
      ["ap:ea:12345678901234567890:d", "admin_presence:policy:edit_action_to:12345678901234567890:delete_all_instances"],
      ["ap:eu:12345678901234567890:12345678901234567890", "admin_presence:policy:edit_account_to:12345678901234567890:12345678901234567890"],
      ["ap:eg:12345678901234567890:12345678901234567890", "admin_presence:policy:edit_group_to:12345678901234567890:12345678901234567890"],
      ["ap:et:12345678901234567890:r:10080", "admin_presence:policy:edit_remind_to:12345678901234567890:10080"]
    ];
    for (const [compact, expanded] of samples) {
      expectFitsTelegramLimit(compact);
      expect(expandCompactCallbackData(compact)).toBe(expanded);
    }
    expect(encodePolicyAction("delete_all_instances")).toBe("d");
    expect(encodePolicyScope("group:123")).toBe("g123");
  });

  it("round-trips compact schedule and instance callbacks with long IDs", () => {
    const samples = [
      ["sc:a:s", "schedules:create:action:shutdown"],
      ["sc:s:s:i", "schedules:create:scope:shutdown:instance"],
      ["sc:ia:s:12345678901234567890", "schedules:create:instance_account:shutdown:12345678901234567890"],
      ["sc:i:s:12345678901234567890:98765432109876543210", "schedules:create:instance:shutdown:12345678901234567890:98765432109876543210"],
      ["sc:p:s:i12345678901234567890_98765432109876543210:0850", "schedules:create:preset:shutdown:instance:12345678901234567890:98765432109876543210:daily_0850"],
      ["sc:c:s:i12345678901234567890_98765432109876543210", "schedules:create:custom:shutdown:instance:12345678901234567890:98765432109876543210"],
      ["i:cd:12345678901234567890:98765432109876543210", "instances:confirm_delete:12345678901234567890:98765432109876543210"]
    ];
    for (const [compact, expanded] of samples) {
      expectFitsTelegramLimit(compact);
      expect(expandCompactCallbackData(compact)).toBe(expanded);
    }
    expect(encodeScheduleAction("shutdown")).toBe("s");
    expect(encodeScheduleScope("instance", 123, undefined, 456)).toBe("i123_456");
  });
});
