import type { LinodeLoginEvent } from "../clients/linode-client";
import type { IpIntelligence } from "./ip-intelligence-service";
import type { SecuritySettings } from "./security-settings-service";

export type LoginAssessment = {
  shouldCreateSecurityEvent: boolean;
  severity: string;
  reasons: string[];
};

export function assessLogin(login: LinodeLoginEvent, settings: SecuritySettings, ipInfo: IpIntelligence | null): LoginAssessment {
  const reasons: string[] = [];
  const status = (login.status ?? "").toLowerCase();
  if (status.includes("fail")) reasons.push("login_failed");
  if (login.ip && settings.ip_allowlist.includes(login.ip)) return { shouldCreateSecurityEvent: false, severity: "low", reasons: ["ip_allowlisted"] };
  const country = ipInfo?.country?.toUpperCase() ?? null;
  if (country && settings.blocked_countries.includes(country)) reasons.push("blocked_country");
  if (country && settings.allowed_countries.length > 0 && !settings.allowed_countries.includes(country)) reasons.push("country_not_allowed");
  if (settings.night_login_enabled && isNightLogin(login.datetime, settings)) reasons.push("night_login");
  if (reasons.length === 0) reasons.push("login_observed");
  const severity = reasons.includes("blocked_country") || reasons.includes("country_not_allowed") ? "high" : reasons.includes("night_login") || reasons.includes("login_failed") ? "medium" : "low";
  return { shouldCreateSecurityEvent: true, severity, reasons };
}

export function loginStatusToSecurityType(login: LinodeLoginEvent): "LOGIN_SUCCESS" | "LOGIN_FAILED" {
  const status = (login.status ?? "").toLowerCase();
  return status.includes("fail") ? "LOGIN_FAILED" : "LOGIN_SUCCESS";
}

function isNightLogin(datetime: string, settings: SecuritySettings): boolean {
  const parts = getZonedHourMinute(new Date(datetime), settings.timezone);
  if (!parts) return false;
  const current = parts.hour * 60 + parts.minute;
  const start = timeToMinutes(settings.night_start);
  const end = timeToMinutes(settings.night_end);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function getZonedHourMinute(date: Date, timezone: string): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(date);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const hour = Number(map.get("hour"));
    const minute = Number(map.get("minute"));
    return Number.isFinite(hour) && Number.isFinite(minute) ? { hour: hour === 24 ? 0 : hour, minute } : null;
  } catch {
    return null;
  }
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
