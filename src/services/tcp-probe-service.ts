export interface TcpProbeResult {
  ok: boolean;
  error?: string;
}

export async function probeTcpPort(host: string, port: number, timeoutMs = 3000): Promise<TcpProbeResult> {
  const normalizedHost = String(host || "").trim();
  if (!normalizedHost) return { ok: false, error: "missing_host" };
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, error: "invalid_port" };

  try {
    const sockets = await import("cloudflare:sockets").catch(() => null as any);
    const connect = sockets?.connect;
    if (typeof connect !== "function") return { ok: false, error: "tcp_socket_unavailable" };

    const socket = connect({ hostname: normalizedHost, port });
    const opened = socket.opened as Promise<unknown> | undefined;
    await withTimeout(opened ?? Promise.resolve(), timeoutMs);
    try { await socket.close(); } catch {}
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatProbeError(error) };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tcp_probe_timeout")), Math.max(500, timeoutMs));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatProbeError(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : String(error ?? "tcp_probe_failed");
  return message.slice(0, 160);
}
