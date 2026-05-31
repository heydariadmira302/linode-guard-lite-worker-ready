import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { SettingsRepository } from "../storage/settings-repository";
import { WindowsVersionService, type WindowsLanguageId, type WindowsVersionId } from "./windows-version-service";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ALLOWED_ISO_HOSTS = new Set(["software.download.prss.microsoft.com", "download.microsoft.com"]);
const MASSGRAVE_WINDOWS_11_URL = "https://massgrave.dev/windows_11_links";

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
    const record: CacheRecord = { version: version.id, lang: lang.id, image_name: version.image_name, iso_url: isoUrl, expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(), source: MASSGRAVE_WINDOWS_11_URL };
    await this.settings.set(key, record);
    return { ...record, cached: false };
  }

  private async fetchIsoUrl(imageName: string, lang: WindowsLanguageId, requestId: string): Promise<string> {
    const fetchImpl = this.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
    const response = await fetchImpl(MASSGRAVE_WINDOWS_11_URL, { headers: { "user-agent": "LinodeGuardLite/WindowsIsoResolver" } });
    if (!response.ok) throw new AppError(ErrorCode.LINODE_API_ERROR, "暂时没找到可用的 Windows 11 官方 ISO，请稍后重试。", requestId, 502);
    const html = await response.text();
    const urls = Array.from(html.matchAll(/https:\/\/(?:software\.download\.prss\.microsoft\.com|download\.microsoft\.com)\/[^\s"'<>]+\.iso(?:\?[^\s"'<>]*)?/gi)).map((match) => decodeHtml(match[0]));
    const langNeedles = lang === "zh-cn" ? ["zh-cn", "chinese", "china"] : ["en-us", "english", "x64"];
    const imageNeedles = imageName.toLowerCase().split(/\s+/).filter(Boolean);
    const selected = urls.find((url) => {
      const lower = url.toLowerCase();
      return isAllowedIsoUrl(url) && langNeedles.some((needle) => lower.includes(needle)) && imageNeedles.some((needle) => lower.includes(needle));
    }) ?? urls.find((url) => isAllowedIsoUrl(url) && langNeedles.some((needle) => url.toLowerCase().includes(needle))) ?? null;
    if (!selected) throw new AppError(ErrorCode.VALIDATION_ERROR, "暂时没找到可用的 Windows 11 官方 ISO，请稍后重试。", requestId, 502);
    return selected;
  }

  private cacheKey(version: WindowsVersionId, lang: WindowsLanguageId): string { return `windows_iso_cache:${version}:${lang}`; }
}

export function isAllowedIsoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_ISO_HOSTS.has(url.hostname.toLowerCase());
  } catch { return false; }
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"');
}
