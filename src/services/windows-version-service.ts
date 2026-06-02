import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";

export type WindowsVersionId = "2k22" | "2k25-cn" | "2k25-cn-dd" | "2k25-en" | "w11-ltsc-2024" | "w11-cn-dd";
export type WindowsLanguageId = "zh-cn" | "en-us";
export type WindowsStackScriptVersion = "2k22" | "2k25-cn" | "2k25-cn-dd" | "2k25-en" | "w11" | "w11-cn-dd";
export type WindowsStability = "stable" | "experimental";

export interface WindowsVersionDefinition {
  id: WindowsVersionId;
  label: string;
  stackscript_version: WindowsStackScriptVersion;
  image_name: string;
  min_memory_mb: number;
  min_disk_mb: number;
  recommended_memory_mb: number;
  estimated_minutes: string;
  stability: WindowsStability;
  requires_iso_resolve: boolean;
  iso_resolved_automatically: boolean;
}

export interface WindowsLanguageDefinition {
  id: WindowsLanguageId;
  label: string;
  windows_locale: "zh-CN" | "en-US";
}

export const WINDOWS_LANGUAGES: WindowsLanguageDefinition[] = [
  { id: "zh-cn", label: "简体中文", windows_locale: "zh-CN" },
  { id: "en-us", label: "English", windows_locale: "en-US" }
];

export const WINDOWS_VERSIONS: WindowsVersionDefinition[] = [
  {
    id: "2k22",
    label: "Windows Server 2022 Evaluation",
    stackscript_version: "2k22",
    image_name: "Windows Server 2022 SERVERDATACENTER",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 4096,
    estimated_minutes: "15-30",
    stability: "stable",
    requires_iso_resolve: false,
    iso_resolved_automatically: false
  },
  {
    id: "2k25-cn",
    label: "Windows Server 2025 简体中文版",
    stackscript_version: "2k25-cn",
    image_name: "Windows Server 2025 SERVERDATACENTER",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 8192,
    estimated_minutes: "20-35",
    stability: "experimental",
    requires_iso_resolve: false,
    iso_resolved_automatically: false
  },
  {
    id: "2k25-cn-dd",
    label: "Windows Server 2025 简体中文 DD 快速安装（实验）",
    stackscript_version: "2k25-cn-dd",
    image_name: "Windows Server 2025 SERVERDATACENTER",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 8192,
    estimated_minutes: "5-15",
    stability: "experimental",
    requires_iso_resolve: false,
    iso_resolved_automatically: false
  },
  {
    id: "2k25-en",
    label: "Windows Server 2025 English",
    stackscript_version: "2k25-en",
    image_name: "Windows Server 2025 SERVERDATACENTER",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 8192,
    estimated_minutes: "20-35",
    stability: "experimental",
    requires_iso_resolve: false,
    iso_resolved_automatically: false
  },
  {
    id: "w11-cn-dd",
    label: "Windows 11 简体中文 DD 快速安装（实验）",
    stackscript_version: "w11-cn-dd",
    image_name: "Windows 11 Pro for Workstations",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 8192,
    estimated_minutes: "5-15",
    stability: "experimental",
    requires_iso_resolve: false,
    iso_resolved_automatically: false
  },
  {
    id: "w11-ltsc-2024",
    label: "Windows 11 Enterprise LTSC 2024",
    stackscript_version: "w11",
    image_name: "Windows 11 Enterprise LTSC 2024",
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    recommended_memory_mb: 8192,
    estimated_minutes: "20-40",
    stability: "experimental",
    requires_iso_resolve: true,
    iso_resolved_automatically: true
  }
];

export class WindowsVersionService {
  listVersions(): WindowsVersionDefinition[] { return WINDOWS_VERSIONS; }
  listLanguages(): WindowsLanguageDefinition[] { return WINDOWS_LANGUAGES; }

  getVersion(version: unknown, requestId: string): WindowsVersionDefinition {
    const id = normalizeWindowsVersion(version);
    const definition = WINDOWS_VERSIONS.find((item) => item.id === id);
    if (!definition) throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Windows version", requestId, 400);
    return definition;
  }

  getLanguage(lang: unknown, requestId: string): WindowsLanguageDefinition {
    const id = normalizeWindowsLanguage(lang);
    const definition = WINDOWS_LANGUAGES.find((item) => item.id === id);
    if (!definition) throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Windows language", requestId, 400);
    return definition;
  }
}

export function normalizeWindowsVersion(version: unknown): WindowsVersionId {
  const raw = typeof version === "string" && version.trim() ? version.trim().toLowerCase() : "2k22";
  if (raw === "2k22" || raw === "2k25-cn" || raw === "2k25-cn-dd" || raw === "2k25-en" || raw === "w11-ltsc-2024" || raw === "w11-cn-dd") return raw;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Windows version", "req_windows", 400);
}

export function normalizeWindowsLanguage(lang: unknown): WindowsLanguageId {
  const raw = typeof lang === "string" && lang.trim() ? lang.trim().toLowerCase() : "en-us";
  if (raw === "zh-cn" || raw === "en-us") return raw;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported Windows language", "req_windows", 400);
}
