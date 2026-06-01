import { describe, expect, it, vi, afterEach } from "vitest";
import { sendTelegramAction, sendTelegramResult } from "../src/telegram/action-sender";

const editAction = {
  method: "editMessageText" as const,
  payload: {
    chat_id: "123456789",
    message_id: 15939,
    text: "保活策略设置",
    reply_markup: { inline_keyboard: [[{ text: "返回主菜单", callback_data: "menu:main" }]] }
  }
};

describe("Telegram send fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to sendMessage when Telegram refuses to edit an old message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, description: "Bad Request: message can't be edited" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 16000 } }), { status: 200 }));

    const result = await sendTelegramResult("realistic-token", editAction);

    expect(result).toEqual([{ ok: true, result: { message_id: 16000 } }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/editMessageText");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/sendMessage");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      chat_id: "123456789",
      text: "保活策略设置"
    });
  });

  it("does not fall back for non-recoverable Telegram errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 }));

    await expect(sendTelegramResult("realistic-token", editAction)).rejects.toThrow("chat not found");
  });


  it("also falls back for stale server detail refresh edits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, description: "Bad Request: message to edit not found" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 16002 } }), { status: 200 }));

    const result = await sendTelegramResult("realistic-token", {
      method: "editMessageText",
      payload: {
        chat_id: "123456789",
        message_id: 15939,
        text: "服务器详情",
        reply_markup: { inline_keyboard: [[{ text: "刷新服务器状态", callback_data: "instances:detail:1:101:account_1" }]] }
      }
    });

    expect(result).toEqual([{ ok: true, result: { message_id: 16002 } }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/sendMessage");
  });

  it("adds visual emoji to inline buttons at send time without changing callbacks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 16001 } }), { status: 200 }));

    await sendTelegramAction("realistic-token", {
      method: "sendMessage",
      payload: {
        chat_id: "123456789",
        text: "按钮美化测试",
        reply_markup: { inline_keyboard: [[
          { text: "➕ 添加账号", callback_data: "accounts:add" },
          { text: "删除这台服务器", callback_data: "instances:confirm_delete:1:101" }
        ], [
          { text: "返回主菜单", callback_data: "menu:main" }
        ]] }
      }
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.reply_markup.inline_keyboard).toEqual([
      [
        { text: "➕ 添加账号", callback_data: "accounts:add" },
        { text: "🚨 删除这台服务器", callback_data: "instances:confirm_delete:1:101" }
      ],
      [
        { text: "↩️ 返回主菜单", callback_data: "menu:main" }
      ]
    ]);
  });
});
