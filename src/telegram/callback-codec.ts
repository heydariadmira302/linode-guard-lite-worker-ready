export function encodeTelegramCallback(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== null && part !== undefined).map(String).join(":");
}

export function expandCompactCallbackData(data: string): string {
  if (data.startsWith("ap:")) return expandAdminPresenceCallbackData(data);
  if (data.startsWith("sc:")) return expandScheduleCallbackData(data);
  if (data.startsWith("i:")) return expandInstanceCallbackData(data);
  return data;
}

export function encodePolicyAction(action: string): string {
  if (action === "pending") return "p";
  if (action === "notify") return "n";
  if (action === "shutdown_all_instances") return "s";
  if (action === "delete_all_instances") return "d";
  return action;
}

export function encodePolicyScope(scope: string): string {
  if (scope === "all") return "a";
  if (scope.startsWith("account:")) return `u${scope.split(":")[1]}`;
  if (scope.startsWith("group:")) return `g${scope.split(":")[1]}`;
  return scope;
}

export function encodeScheduleAction(action: string): string {
  if (action === "boot") return "b";
  if (action === "shutdown") return "s";
  if (action === "reboot") return "r";
  return action;
}

export function encodeScheduleScope(scope: "all" | "account" | "group" | "instance", accountId?: number, groupId?: number, instanceId?: number): string {
  if (scope === "all") return "a";
  if (scope === "account") return `u${accountId}`;
  if (scope === "group") return `g${groupId}`;
  return `i${accountId}_${instanceId}`;
}

function expandAdminPresenceCallbackData(data: string): string {
  const parts = data.split(":");
  const kind = parts[1];
  if (kind === "ca" && parts.length === 4) return `admin_presence:policy:create_action_after_remind:${parts[2]}:${decodePolicyAction(parts[3])}`;
  if (kind === "cs" && parts.length === 5) return `admin_presence:policy:create_scope_after_remind:${parts[2]}:${decodePolicyAction(parts[3])}:${decodeScopeChoice(parts[4])}`;
  if (kind === "cs0" && parts.length === 4) return `admin_presence:policy:create_scope:${decodePolicyAction(parts[2])}:${decodeScopeChoice(parts[3])}`;
  if (kind === "cua" && parts.length === 5) return `admin_presence:policy:create_account_after_remind:${parts[2]}:${decodePolicyAction(parts[3])}:${parts[4]}`;
  if (kind === "cu" && parts.length === 4) return `admin_presence:policy:create_account:${decodePolicyAction(parts[2])}:${parts[3]}`;
  if (kind === "cga" && parts.length === 5) return `admin_presence:policy:create_group_after_remind:${parts[2]}:${decodePolicyAction(parts[3])}:${parts[4]}`;
  if (kind === "cg" && parts.length === 4) return `admin_presence:policy:create_group:${decodePolicyAction(parts[2])}:${parts[3]}`;
  if (kind === "cr" && parts.length === 5) return `admin_presence:policy:create_remind:${decodePolicyAction(parts[2])}:${decodePolicyScope(parts[3])}:${parts[4]}`;
  if (kind === "cf" && parts.length === 6) return `admin_presence:policy:create_final:${decodePolicyAction(parts[2])}:${decodePolicyScope(parts[3])}:${parts[4]}:${parts[5]}`;
  if (kind === "ch" && parts.length === 7) return `admin_presence:policy:create_hourly:${decodePolicyAction(parts[2])}:${decodePolicyScope(parts[3])}:${parts[4]}:${parts[5]}:${parts[6]}`;
  if (kind === "cth" && parts.length === 5) return `admin_presence:policy:create_time_hour:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}`;
  if (kind === "cth" && parts.length === 6) return `admin_presence:policy:create_time_hour:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}:${parts[5]}`;
  if (kind === "ctm" && parts.length === 6) return `admin_presence:policy:create_time_minute:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}:${parts[5]}`;
  if (kind === "ctm" && parts.length === 7) return `admin_presence:policy:create_time_minute:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}:${parts[5]}:${parts[6]}`;
  if (kind === "ct" && parts.length === 7) return `admin_presence:policy:create_time:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}:${parts[5]}:${parts[6]}`;
  if (kind === "ct" && parts.length === 8) return `admin_presence:policy:create_time:${parts[2] === "r" ? "remind" : "final"}:${decodePolicyAction(parts[3])}:${decodePolicyScope(parts[4])}:${parts[5]}:${parts[6]}:${parts[7]}`;
  if (kind === "eth" && parts.length === 4) return `admin_presence:policy:edit_time_hour:${parts[2] === "r" ? "remind" : "final"}:${parts[3]}`;
  if (kind === "etm" && parts.length === 5) return `admin_presence:policy:edit_time_minute:${parts[2] === "r" ? "remind" : "final"}:${parts[3]}:${parts[4]}`;
  if (kind === "etc" && parts.length === 6) return `admin_presence:policy:edit_time:${parts[2] === "r" ? "remind" : "final"}:${parts[3]}:${parts[4]}:${parts[5]}`;
  if (kind === "ea" && parts.length === 4) return `admin_presence:policy:edit_action_to:${parts[2]}:${decodePolicyAction(parts[3])}`;
  if (kind === "es" && parts.length === 4) return `admin_presence:policy:edit_scope_to:${parts[2]}:${decodeScopeChoice(parts[3])}`;
  if (kind === "eu" && parts.length === 4) return `admin_presence:policy:edit_account_to:${parts[2]}:${parts[3]}`;
  if (kind === "eg" && parts.length === 4) return `admin_presence:policy:edit_group_to:${parts[2]}:${parts[3]}`;
  if (kind === "et" && parts.length === 5) return `admin_presence:policy:edit_${parts[3] === "r" ? "remind" : "final"}_to:${parts[2]}:${parts[4]}`;
  return data;
}

function expandInstanceCallbackData(data: string): string {
  const parts = data.split(":");
  if (parts[1] === "cd" && parts.length === 4) return `instances:confirm_delete:${parts[2]}:${parts[3]}`;
  return data;
}

function expandScheduleCallbackData(data: string): string {
  const parts = data.split(":");
  const kind = parts[1];
  if (kind === "ea" && parts.length === 4) return `schedules:edit_action_to:${parts[2]}:${decodeScheduleAction(parts[3])}`;
  if (kind === "es" && parts.length === 4) return `schedules:edit_scope_to:${parts[2]}:${decodeScheduleScopeChoice(parts[3])}`;
  if (kind === "ep" && parts.length === 4) return `schedules:edit_preset:${parts[2]}:daily_${parts[3]}`;
  if (kind === "eh" && parts.length === 3) return `schedules:edit_hour:${parts[2]}`;
  if (kind === "em" && parts.length === 4) return `schedules:edit_minute:${parts[2]}:${parts[3]}`;
  if (kind === "et" && parts.length === 5) return `schedules:edit_selected_time:${parts[2]}:${parts[3]}:${parts[4]}`;
  if (kind === "a" && parts.length === 3) return `schedules:create:action:${decodeScheduleAction(parts[2])}`;
  if (kind === "s" && parts.length === 4) return `schedules:create:scope:${decodeScheduleAction(parts[2])}:${decodeScheduleScopeChoice(parts[3])}`;
  if (kind === "u" && parts.length === 4) return `schedules:create:account:${decodeScheduleAction(parts[2])}:${parts[3]}`;
  if (kind === "g" && parts.length === 4) return `schedules:create:group:${decodeScheduleAction(parts[2])}:${parts[3]}`;
  if (kind === "ia" && parts.length === 4) return `schedules:create:instance_account:${decodeScheduleAction(parts[2])}:${parts[3]}`;
  if (kind === "i" && parts.length === 5) return `schedules:create:instance:${decodeScheduleAction(parts[2])}:${parts[3]}:${parts[4]}`;
  if (kind === "p" && parts.length === 5) return `schedules:create:preset:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}:daily_${parts[4]}`;
  if (kind === "pback" && parts.length === 4) return `schedules:create:time:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}`;
  if (kind === "th" && parts.length === 4) return `schedules:create:hour:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}`;
  if (kind === "tm" && parts.length === 5) return `schedules:create:minute:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}:${parts[4]}`;
  if (kind === "t" && parts.length === 6) return `schedules:create:selected_time:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}:${parts[4]}:${parts[5]}`;
  if (kind === "c" && parts.length === 4) return `schedules:create:custom:${decodeScheduleAction(parts[2])}:${decodeScheduleScope(parts[3])}`;
  return data;
}

function decodePolicyAction(value: string): string {
  if (value === "p") return "pending";
  if (value === "n") return "notify";
  if (value === "s") return "shutdown_all_instances";
  if (value === "d") return "delete_all_instances";
  return value;
}

function decodeScopeChoice(value: string): string {
  if (value === "a") return "all";
  if (value === "u") return "account";
  if (value === "g") return "group";
  return value;
}

function decodePolicyScope(value: string): string {
  if (value === "a") return "all";
  if (value.startsWith("u")) return `account:${value.slice(1)}`;
  if (value.startsWith("g")) return `group:${value.slice(1)}`;
  return value;
}

function decodeScheduleAction(value: string): string {
  if (value === "b") return "boot";
  if (value === "s") return "shutdown";
  if (value === "r") return "reboot";
  return value;
}

function decodeScheduleScopeChoice(value: string): string {
  if (value === "a") return "all";
  if (value === "u") return "account";
  if (value === "g") return "group";
  if (value === "i") return "instance";
  return value;
}

function decodeScheduleScope(value: string): string {
  if (value === "a") return "all";
  if (value.startsWith("u")) return `account:${value.slice(1)}`;
  if (value.startsWith("g")) return `group:${value.slice(1)}`;
  if (value.startsWith("i")) {
    const [accountId, instanceId] = value.slice(1).split("_");
    return `instance:${accountId}:${instanceId}`;
  }
  return value;
}
