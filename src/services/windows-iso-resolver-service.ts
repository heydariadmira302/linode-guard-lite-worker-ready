import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { SettingsRepository } from "../storage/settings-repository";
import { WindowsVersionService, type WindowsLanguageId, type WindowsVersionId } from "./windows-version-service";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ALLOWED_ISO_HOSTS = new Set(["software.download.prss.microsoft.com", "software-static.download.prss.microsoft.com", "download.microsoft.com"]);
const MICROSOFT_WINDOWS_11_ENTERPRISE_DOWNLOAD_URL = "https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise";

export interface ResolveWindowsIsoInput { version: WindowsVersionId; lang: WindowsLanguageId; requestId: string }
export interface ResolvedWindowsIso { version: WindowsVersionId; lang: WindowsLanguageId; image_name: string; iso_url: string; cached: boolean; expires_at: string; source: string }
interface CacheRecord { version: WindowsVersionId; lang: WindowsLanguageId; image_name: string; iso_url: string; expires_at: string; source: string }

export class WindowsIsoResolverService {
  private readonly settings: SettingsRepository;
  private readonly versions = new WindowsVersionService();

  constructor(private readonly env: Env, settings?: SettingsRepository, private readonly fetcher?: typeof fetch) {
    if (!env.DB && !settings) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_windows_iso", 500);
    this.settings = settings ?? new SettingsRepository(env.DB as D1Database);
  }

  async resolve(input: ResolveWindowsIsoInput): Promise<ResolvedWindowsIso> {
    const version = this.versions.getVersion(input.version, input.requestId);
    const lang = this.versions.getLanguage(input.lang, input.requestId);
    if (!version.requires_iso_resolve) throw new AppError(ErrorCode.VALIDATION_ERROR, "This Windows version does not require ISO resolve", input.requestId, 400);

    const key = this.cacheKey(version.id, lang.id);
    const cached = await this.settings.get<CacheRecord>(key).catch(() => null);
    if (cached && Date.parse(cached.expires_at) > Date.now() && isAllowedIsoUrl(cached.iso_url)) return { ...cached, cached: true };

    const isoUrl = await this.fetchIsoUrl(version.image_name, lang.id, input.requestId);
    const record: CacheRecord = { version: version.id, lang: lang.id, image_name: version.image_name, iso_url: isoUrl, expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(), source: MICROSOFT_WINDOWS_11_ENTERPRISE_DOWNLOAD_URL };
    await this.settings.set(key, record);
    return { ...record, cached: false };
  }

  private async fetchIsoUrl(imageName: string, lang: WindowsLanguageId, requestId: string): Promise<string> {
    const fetchImpl = this.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    const response = await fetchImpl(MICROSOFT_WINDOWS_11_ENTERPRISE_DOWNLOAD_URL, { headers: { "user-agent": "LinodeGuardLite/WindowsIsoResolver" } });
    if (!response.ok) throw new AppError(ErrorCode.LINODE_API_ERROR, "暂时没找到可用的 Windows 11 官方 ISO，请稍后重试。", requestId, 502);
    const html = decodeHtml(await response.text());
    const fwlink = findMicrosoftLtscFwlink(html, lang);
    if (!fwlink) throw new AppError(ErrorCode.VALIDATION_ERROR, "暂时没找到可用的 Windows 11 官方 ISO，请稍后重试。", requestId, 502);
    const finalUrl = await resolveMicrosoftFwlink(fetchImpl, fwlink, requestId);
    if (!isAllowedIsoUrl(finalUrl)) throw new AppError(ErrorCode.VALIDATION_ERROR, "解析到的 Windows 11 ISO 不是允许的 Microsoft 官方下载域名", requestId, 502);
    return finalUrl;
  }

  private cacheKey(version: WindowsVersionId, lang: WindowsLanguageId): string { return `windows_iso_cache:${version}:${lang}`; }
}

export function isAllowedIsoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_ISO_HOSTS.has(url.hostname.toLowerCase());
  } catch { return false; }
}

function findMicrosoftLtscFwlink(html: string, lang: WindowsLanguageId): string | null {
  const locale = lang === "zh-cn" ? "zh-CN" : "en-US";
  const ariaPattern = new RegExp(`href="(https://go\.microsoft\.com/fwlink/\?[^"]+)"[^>]+aria-label="[^"]*Enterprise ISO LTSC 64-bit \(${locale}\)"`, "i");
  const ariaMatch = html.match(ariaPattern);
  if (ariaMatch?.[1]) return ariaMatch[1];
  const biName = lang === "zh-cn" ? "win11entltsc64cn" : "win11entltsc64us";
  const biPattern = new RegExp(`${biName}[^<]+href="(https://go\.microsoft\.com/fwlink/\?[^"]+)"`, "i");
  const biMatch = html.match(biPattern);
  if (biMatch?.[1]) return biMatch[1];
  // Microsoft Evaluation Center currently exposes stable official fwlinks for
  // Windows 11 Enterprise LTSC 2024 x64. Keep this as a fallback so minor
  // markup changes do not block creation while still resolving to Microsoft.
  return lang === "zh-cn"
    ? "https://go.microsoft.com/fwlink/?linkid=2288085&clcid=0x409&culture=en-us&country=us"
    : "https://go.microsoft.com/fwlink/?linkid=2289029&clcid=0x409&culture=en-us&country=us";
}

async function resolveMicrosoftFwlink(fetchImpl: typeof fetch, fwlink: string, requestId: string): Promise<string> {
  const response = await fetchImpl(fwlink, { method: "GET", redirect: "follow", headers: { "user-agent": "LinodeGuardLite/WindowsIsoResolver" } });
  if (!response.ok) throw new AppError(ErrorCode.LINODE_API_ERROR, "Microsoft Windows 11 ISO fwlink 解析失败", requestId, 502);
  const finalUrl = response.url || fwlink;
  if (!finalUrl.toLowerCase().includes(".iso")) throw new AppError(ErrorCode.VALIDATION_ERROR, "Microsoft Windows 11 ISO fwlink 未返回 ISO 链接", requestId, 502);
  return finalUrl;
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').replace(/&#34;/g, '"');
}
