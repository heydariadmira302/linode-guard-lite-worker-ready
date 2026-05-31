import type { LinodeInstance } from "../clients/linode-client";
import type { AccountInstancesResult, InstanceDetailResult } from "../services/instance-service";
import type { PublicAccount } from "../services/account-service";
import type { TelegramInlineKeyboardButton, TelegramInlineKeyboardMarkup } from "./types";

export function renderInstancesMenuText(): string {
  return [
    "🖥 服务器管理",
    "━━━━━━━━━━━━",
    "默认展示全部服务器，适合日常巡检。",
    "进入服务器详情后，可以执行开机、关机、重启等操作。",
    "",
    "需要缩小范围时，再按账号、分组或状态筛选。"
  ].join("\n");
}

export function renderInstancesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🖥 查看全部服务器", callback_data: "instances:list:all" }],
      [{ text: "🔎 筛选", callback_data: "instances:filter" }, { text: "⚡ 批量操作", callback_data: "menu:batch" }],
      [{ text: "🏠 返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderInstanceFilterText(): string {
  return [
    "🔎 服务器筛选",
    "━━━━━━━━━━━━",
    "选择一种查看方式，快速定位目标服务器。",
    "",
    "日常巡检看全部；排查问题时按状态或分组过滤。"
  ].join("\n");
}

export function renderInstanceFilterKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "👤 按账号查看", callback_data: "instances:accounts" }, { text: "📁 按分组查看", callback_data: "instances:groups" }],
      [{ text: "🟢 运行中", callback_data: "instances:list:status:running" }, { text: "⚫️ 已关机", callback_data: "instances:list:status:offline" }],
      [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderInstanceAccountsText(accounts: PublicAccount[]): string {
  return [
    "👤 选择账号查看服务器",
    "━━━━━━━━━━━━",
    accounts.length ? accounts.map((account) => `#${account.id} ${account.alias}${account.group_name ? `（${account.group_name}）` : ""}`).join("\n") : "暂无启用中的 Linode 账号。"
  ].join("\n");
}

export function renderInstanceAccountsKeyboard(accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `👤 #${account.id} ${account.alias}`, callback_data: `instances:list:account:${account.id}` }]),
      [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderInstanceGroupsText(groups: Array<{ id: number; name: string; account_count?: number }>): string {
  return [
    "📁 选择分组查看服务器",
    "━━━━━━━━━━━━",
    groups.length ? groups.map((group) => `#${group.id} ${group.name}${typeof group.account_count === "number" ? `（${group.account_count} 个账号）` : ""}`).join("\n") : "暂无可用分组。"
  ].join("\n");
}

export function renderInstanceGroupsKeyboard(groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.map((group) => [{ text: `📁 ${group.name}`, callback_data: `instances:list:group:${group.id}` }]),
      [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderAllInstancesText(results: AccountInstancesResult[]): string {
  if (results.length === 0) return "🖥 服务器列表\n━━━━━━━━━━━━\n暂无启用中的 Linode 账号。";
  const total = results.reduce((sum, result) => sum + result.instances.length, 0);
  const running = results.reduce((sum, result) => sum + result.instances.filter((instance) => instance.status === "running").length, 0);
  const offline = results.reduce((sum, result) => sum + result.instances.filter((instance) => ["offline", "powered_off"].includes(instance.status)).length, 0);
  return [
    "🖥 服务器列表",
    "━━━━━━━━━━━━",
    `共 ${total} 台 / 运行 ${running} / 离线 ${offline} / 账号 ${results.length}`,
    "",
    ...results.map((result) => renderAccountInstanceBlock(result.account.alias, result.account.group_name, result.instances))
  ].join("\n");
}

export function renderAccountInstancesText(result: AccountInstancesResult): string {
  return [
    "🖥 服务器列表",
    "━━━━━━━━━━━━",
    `账号：${result.account.alias}`,
    `数量：${result.instances.length} 台`,
    "",
    renderAccountInstanceBlock(result.account.alias, result.account.group_name, result.instances)
  ].join("\n");
}

type InstanceListContext = "all" | "account" | "group" | "status_running" | "status_offline";

export function renderInstancesListKeyboard(results: AccountInstancesResult[], context: InstanceListContext = "all", accountId?: number, groupId?: number): TelegramInlineKeyboardMarkup {
  const source = buildInstanceSource(context, accountId, groupId);
  const detailButtons = results.flatMap((result) => result.instances.map((instance) => [{
    text: `详情 #${instance.id}`,
    callback_data: `instances:detail:${result.account.id}:${instance.id}:${source}`
  }]));
  const backButton = context === "account" && accountId
    ? { text: "↩️ 返回账号服务器", callback_data: `instances:list:account:${accountId}` }
    : context === "group" && groupId
      ? { text: "↩️ 返回分组服务器", callback_data: `instances:list:group:${groupId}` }
      : context === "status_running"
        ? { text: "↩️ 返回运行中列表", callback_data: "instances:list:status:running" }
        : context === "status_offline"
          ? { text: "↩️ 返回已关机列表", callback_data: "instances:list:status:offline" }
          : { text: "↩️ 返回服务器管理", callback_data: "menu:instances" };
  return {
    inline_keyboard: [
      ...detailButtons,
      [{ text: "🔄 刷新", callback_data: refreshCallbackForContext(context, accountId, groupId) }, { text: "🔎 筛选", callback_data: "instances:filter" }],
      [context === "status_running" || context === "status_offline" ? { text: "↩️ 返回筛选", callback_data: "instances:filter" } : backButton]
    ]
  };
}

export function renderInstanceDetailText(result: InstanceDetailResult): string {
  const instance = result.instance;
  const ipv4Lines = instance.ipv4?.length ? instance.ipv4.map((ip) => `• ${ip}`) : ["• -"];
  return [
    `${statusIcon(instance.status)} 服务器详情`,
    "━━━━━━━━━━━━",
    `名称：${instance.label}`,
    `ID：${instance.id}`,
    `状态：${translateInstanceStatus(instance.status)}`,
    `地区：${instance.region}`,
    "",
    "归属：",
    `• 账号：#${result.account.id} ${result.account.alias}`,
    `• 分组：${result.account.group_name ?? "未分组"}`,
    "",
    "网络：",
    ...ipv4Lines,
    "",
    "配置：",
    ...renderSpecsLines(instance.specs).map((line) => `• ${line}`),
    "",
    "系统：",
    instance.image ? `• 镜像：${instance.image}` : "• 镜像：-",
    instance.created ? `• 创建：${instance.created}` : "• 创建：-",
    instance.updated ? `• 更新：${instance.updated}` : "• 更新：-",
    instance.tags?.length ? `• 标签：${instance.tags.join(", ")}` : "• 标签：-"
  ].join("\n");
}

export function renderInstanceDetailKeyboard(result: InstanceDetailResult, source = `account_${result.account.id}`): TelegramInlineKeyboardMarkup {
  const accountId = result.account.id;
  const instanceId = result.instance.id;
  const rows: TelegramInlineKeyboardButton[][] = statusActionRows(accountId, instanceId, result.instance.status, source);
  const primaryIpv4 = result.instance.ipv4?.[0];
  if (primaryIpv4) {
    rows.push([{ text: primaryIpv4, copy_text: { text: primaryIpv4 } }]);
    rows.push([{ text: `ssh root@${primaryIpv4}`, copy_text: { text: `ssh root@${primaryIpv4}` } }]);
    rows.push([{ text: `${primaryIpv4}:3389`, copy_text: { text: `${primaryIpv4}:3389` } }, { text: "Administrator", copy_text: { text: "Administrator" } }]);
  }
  rows.push([{ text: String(instanceId), copy_text: { text: String(instanceId) } }]);
  rows.push([{ text: "🚨 危险操作", callback_data: `instances:danger:${accountId}:${instanceId}:${source}`, style: "danger" }]);
  rows.push([{ text: "⬅️ 返回列表", callback_data: backToInstanceListCallback(source, accountId, result.account.group_id ?? undefined) }]);
  return { inline_keyboard: rows };
}

export function renderInstanceDangerText(result: InstanceDetailResult): string {
  return [
    "⚠️ 危险操作",
    "━━━━━━━━━━━━",
    "这些操作可能影响服务，或造成不可恢复损失。",
    "",
    `服务器：${result.instance.label}`,
    `账号：#${result.account.id} ${result.account.alias}`,
    `IPv4：${result.instance.ipv4?.[0] ?? "-"}`,
    "",
    "请确认你知道这台服务器的用途，再继续。"
  ].join("\n");
}

export function renderInstanceDangerKeyboard(result: InstanceDetailResult, source = `account_${result.account.id}`): TelegramInlineKeyboardMarkup {
  const accountId = result.account.id;
  const instanceId = result.instance.id;
  return {
    inline_keyboard: [
      [{ text: "🚨 删除服务器", callback_data: `i:cd:${accountId}:${instanceId}`, style: "danger" }],
      [{ text: "❌ 取消，返回详情", callback_data: `instances:detail:${accountId}:${instanceId}:${source}` }]
    ]
  };
}

function renderSpecsLines(specs: unknown): string[] {
  if (!specs || typeof specs !== "object") return ["CPU：-", "内存：-", "磁盘：-", "流量：-"];
  const values = specs as { vcpus?: unknown; memory?: unknown; disk?: unknown; transfer?: unknown };
  return [
    typeof values.vcpus === "number" ? `CPU：${values.vcpus} vCPU` : "CPU：-",
    typeof values.memory === "number" ? `内存：${values.memory} MB` : "内存：-",
    typeof values.disk === "number" ? `磁盘：${values.disk} MB` : "磁盘：-",
    typeof values.transfer === "number" ? `流量：${values.transfer} GB` : "流量：-"
  ];
}

export function renderAccountInstanceBlock(accountAlias: string, groupName: string | null | undefined, instances: LinodeInstance[]): string {
  const groupLine = `分组：${groupName ?? "未分组"}`;
  if (instances.length === 0) {
    return [`账号：${accountAlias}`, groupLine, "暂无服务器。", ""].join("\n");
  }
  return [
    `账号：${accountAlias}`,
    groupLine,
    "",
    ...instances.map((instance) => [
      `${statusIcon(instance.status)} ${instance.label}`,
      `ID：${instance.id}`,
      `状态：${translateInstanceStatus(instance.status)}`,
      `地区：${instance.region}`,
      `IPv4：${instance.ipv4?.[0] ?? "-"}`,
      ""
    ].join("\n"))
  ].join("\n");
}

function statusIcon(status: string): string {
  if (status === "running") return "🟢";
  if (status === "offline") return "⚫️";
  if (["booting", "rebooting", "shutting_down", "provisioning", "migrating", "rebuilding", "cloning", "restoring", "deleting"].includes(status)) return "🟡";
  return "⚪️";
}

function refreshCallbackForContext(context: InstanceListContext, accountId?: number, groupId?: number): string {
  if (context === "account" && accountId) return `instances:list:account:${accountId}`;
  if (context === "group" && groupId) return `instances:list:group:${groupId}`;
  if (context === "status_running") return "instances:list:status:running";
  if (context === "status_offline") return "instances:list:status:offline";
  return "instances:list:all";
}

function statusActionRows(accountId: number, instanceId: number, status: string, source: string): TelegramInlineKeyboardButton[][] {
  if (status === "running") {
    return [[
      { text: "⚠️ 关机", callback_data: `instances:confirm_shutdown:${accountId}:${instanceId}:${source}`, style: "primary" },
      { text: "🔄 重启", callback_data: `instances:confirm_reboot:${accountId}:${instanceId}:${source}`, style: "primary" }
    ]];
  }
  if (status === "offline") {
    return [[{ text: "✅ 开机", callback_data: `instances:boot:${accountId}:${instanceId}:${source}`, style: "success" }]];
  }
  return [[{ text: "🔄 刷新状态", callback_data: `instances:detail:${accountId}:${instanceId}:${source}` }]];
}

function buildInstanceSource(context: InstanceListContext, accountId?: number, groupId?: number): string {
  if (context === "account" && accountId) return `account_${accountId}`;
  if (context === "group" && groupId) return `group_${groupId}`;
  if (context === "status_running") return "status_running";
  if (context === "status_offline") return "status_offline";
  return "all";
}

function backToInstanceListCallback(source: string, accountId: number, groupId?: number): string {
  if (source.startsWith("account_")) return `instances:list:account:${source.slice("account_".length) || accountId}`;
  if (source.startsWith("group_")) return `instances:list:group:${source.slice("group_".length) || groupId || 1}`;
  if (source === "status_running") return "instances:list:status:running";
  if (source === "status_offline") return "instances:list:status:offline";
  return "instances:list:all";
}

function translateInstanceStatus(status: string): string {
  if (status === "running") return "运行中";
  if (status === "offline") return "已关机";
  if (status === "booting") return "开机中";
  if (status === "shutting_down") return "关机中";
  if (status === "rebooting") return "重启中";
  if (status === "provisioning") return "创建中";
  if (status === "deleting") return "删除中";
  if (status === "migrating") return "迁移中";
  if (status === "rebuilding") return "重装中";
  if (status === "cloning") return "克隆中";
  if (status === "restoring") return "恢复中";
  return status ? "未知状态" : "未知";
}
