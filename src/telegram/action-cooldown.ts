export {};

type CooldownEntry = {
  requestId: string;
  expiresAt: number;
};

type CooldownStore = Map<string, CooldownEntry>;

export type ActionCooldownResult =
  | { acquired: true }
  | { acquired: false; requestId: string; retryAfterSeconds: number };

const DEFAULT_COOLDOWN_MS = 30_000;

export function acquireActionCooldown(key: string, requestId: string, ttlMs = DEFAULT_COOLDOWN_MS, now = Date.now()): ActionCooldownResult {
  const store = getCooldownStore();
  for (const [entryKey, entry] of store) {
    if (entry.expiresAt <= now) store.delete(entryKey);
  }

  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return {
      acquired: false,
      requestId: existing.requestId,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
    };
  }

  store.set(key, { requestId, expiresAt: now + ttlMs });
  return { acquired: true };
}

export function renderActionCooldownText(result: Exclude<ActionCooldownResult, { acquired: true }>): string {
  return [
    "操作正在处理中",
    "",
    "系统已经收到同一个高危操作，请不要重复点击。",
    `首次请求编号：${result.requestId}`,
    `建议等待：${result.retryAfterSeconds} 秒后再刷新状态或重试。`
  ].join("\n");
}

function getCooldownStore(): CooldownStore {
  const state = globalThis as typeof globalThis & { __linodeGuardTelegramActionCooldown?: CooldownStore };
  if (!state.__linodeGuardTelegramActionCooldown) state.__linodeGuardTelegramActionCooldown = new Map();
  return state.__linodeGuardTelegramActionCooldown;
}
