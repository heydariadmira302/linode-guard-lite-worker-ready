import type { LinodeFirewall } from "../clients/linode-client";

export function firewallAllowsRdp(firewall: LinodeFirewall | null | undefined): boolean {
  if (!firewall) return true;
  const inbound = firewall.rules?.inbound ?? [];
  return inbound.some((rule) => {
    if (String(rule.action ?? "").toUpperCase() !== "ACCEPT") return false;
    const protocol = String(rule.protocol ?? "").toUpperCase();
    if (protocol !== "TCP" && protocol !== "ALL") return false;
    return portsInclude(rule.ports ?? "", 3389);
  });
}

export function describeRdpFirewallStatus(firewall: LinodeFirewall | null | undefined): { ok: boolean; message: string } {
  if (!firewall) return { ok: true, message: "未使用 Linode Firewall" };
  const ok = firewallAllowsRdp(firewall);
  return { ok, message: ok ? `Firewall #${firewall.id} ${firewall.label} 已放行 TCP 3389` : `Firewall #${firewall.id} ${firewall.label} 未检测到 TCP 3389 入站放行规则` };
}

function portsInclude(raw: string, port: number): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value === "all" || value === "1-65535") return true;
  return value.split(",").some((part) => {
    const item = part.trim();
    if (item === String(port)) return true;
    const [start, end] = item.split("-").map((n) => Number(n));
    return Number.isFinite(start) && Number.isFinite(end) && port >= start && port <= end;
  });
}
