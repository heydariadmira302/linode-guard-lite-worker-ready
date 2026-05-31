export type IpIntelligence = {
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  asn: string | null;
  org: string | null;
};

export class IpIntelligenceService {
  async lookup(ip: string): Promise<IpIntelligence> {
    const normalizedIp = ip.trim();
    if (!normalizedIp) return emptyIpInfo(ip);
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`);
      if (!response.ok) return emptyIpInfo(normalizedIp);
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (body.success === false) return emptyIpInfo(normalizedIp);
      const connection = body.connection && typeof body.connection === "object" ? body.connection as Record<string, unknown> : {};
      return {
        ip: normalizedIp,
        country: typeof body.country_code === "string" ? body.country_code.toUpperCase() : typeof body.country === "string" ? body.country : null,
        region: typeof body.region === "string" ? body.region : null,
        city: typeof body.city === "string" ? body.city : null,
        asn: typeof connection.asn === "number" || typeof connection.asn === "string" ? `AS${String(connection.asn).replace(/^AS/i, "")}` : null,
        org: typeof connection.org === "string" ? connection.org : typeof connection.isp === "string" ? connection.isp : null
      };
    } catch {
      return emptyIpInfo(normalizedIp);
    }
  }
}

function emptyIpInfo(ip: string): IpIntelligence {
  return { ip, country: null, region: null, city: null, asn: null, org: null };
}
