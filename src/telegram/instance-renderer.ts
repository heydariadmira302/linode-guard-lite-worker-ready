import type { LinodeInstance } from "../clients/linode-client";
import type { AccountInstancesResult, InstanceDetailResult } from "../services/instance-service";
import type { PublicAccount } from "../services/account-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderInstancesMenuText(): string {
  return [
    "🖥 服务器管理",
    "",
    "请选择查看范围：",
    "",
    "全部服务器",
    "按分组查看",
    "按账号查看",
    "运行中",
    "已关机"
  ].join("\n");
}

export function renderInstancesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看全部服务器", callback_data: "instances:list:all" }],
      [{ text: "按分组查看", callback_data: "instances:groups" }],
      [{ text: "选择账号", callback_data: "instances:accounts" }],
      [
        { text: "运行中", callback_data: "instances:list:status:running" },
        { text: "已关机", callback_data: "instances:list:status:offline" }
      ],
      [{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]
    ]
  };
}

export function renderInstanceAccountsText(accounts: PublicAccount[]): string {
  return [
    "选择账号查看服务器",
    "",
    accounts.length ? accounts.map((account) => `#${account.id} ${account.alias}${account.group_name ? `（${account.group_name}）` : ""}`).join("\n") : "暂无 active Linode 账号。"
  ].join("\n");
}

export function renderInstanceAccountsKeyboard(accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...accounts.map((account) => [{ text: `#${account.id} ${account.alias}`, callback_data: `instances:list:account:${account.id}` }]),
      [{ text: "返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderInstanceGroupsText(groups: Array<{ id: number; name: string; account_count?: number }>): string {
  return [
    "选择分组查看服务器",
    "",
    groups.length ? groups.map((group) => `#${group.id} ${group.name}${typeof group.account_count === "number" ? `（${group.account_count} 个账号）` : ""}`).join("\n") : "暂无可用分组。"
  ].join("\n");
}

export function renderInstanceGroupsKeyboard(groups: Array<{ id: number; name: string }>): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.map((group) => [{ text: group.name, callback_data: `instances:list:group:${group.id}` }]),
      [{ text: "返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderAllInstancesText(results: AccountInstancesResult[]): string {
  if (results.length === 0) return "服务器列表\n\n暂无 active Linode 账号。";
  return [
    "服务器列表",
    "",
    ...results.map((result) => renderAccountInstanceBlock(result.account.alias, result.account.group_name, result.instances))
  ].join("\n");
}

export function renderAccountInstancesText(result: AccountInstancesResult): string {
  return [
    "服务器列表",
    "",
    renderAccountInstanceBlock(result.account.alias, result.account.group_name, result.instances)
  ].join("\n");
}

export function renderInstancesListKeyboard(results: AccountInstancesResult[], context: "all" | "account" | "group" = "all", accountId?: number, groupId?: number): TelegramInlineKeyboardMarkup {
  const detailButtons = results.flatMap((result) => result.instances.map((instance) => [{
    text: `详情 #${instance.id}`,
    callback_data: `instances:detail:${result.account.id}:${instance.id}`
  }]));
  const backButton = context === "account" && accountId
    ? { text: "返回账号服务器", callback_data: `instances:list:account:${accountId}` }
    : context === "group" && groupId
      ? { text: "返回分组服务器", callback_data: `instances:list:group:${groupId}` }
      : { text: "返回服务器管理", callback_data: "menu:instances" };
  return {
    inline_keyboard: [
      ...detailButtons,
      [backButton],
      [{ text: "查看全部服务器", callback_data: "instances:list:all" }, { text: "按分组查看", callback_data: "instances:groups" }]
    ]
  };
}

export function renderInstanceDetailText(result: InstanceDetailResult): string {
  const instance = result.instance;
  const ipv4Lines = instance.ipv4?.length ? instance.ipv4.map((ip) => `- ${ip}`) : ["-"];
  return [
    "🖥 服务器详情",
    "",
    `名称：${instance.label}`,
    `ID：${instance.id}`,
    `账号：#${result.account.id} ${result.account.alias}`,
    `分组：${result.account.group_name ?? "未分组"}`,
    `地区：${instance.region}`,
    `状态：${translateInstanceStatus(instance.status)}`,
    "IPv4：",
    ...ipv4Lines,
    instance.image ? `镜像：${instance.image}` : "镜像：-",
    instance.created ? `创建时间：${instance.created}` : "创建时间：-",
    instance.updated ? `更新时间：${instance.updated}` : "更新时间：-",
    instance.tags?.length ? `标签：${instance.tags.join(", ")}` : "标签：-",
    ...renderSpecsLines(instance.specs)
  ].join("\n");
}

export function renderInstanceDetailKeyboard(result: InstanceDetailResult): TelegramInlineKeyboardMarkup {
  const accountId = result.account.id;
  const instanceId = result.instance.id;
  const rows = statusActionRows(accountId, instanceId, result.instance.status);
  rows.push([{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]);
  rows.push([
    { text: "返回账号服务器", callback_data: `instances:list:account:${accountId}` },
    { text: "返回分组服务器", callback_data: `instances:list:group:${result.account.group_id ?? 1}` },
    { text: "返回服务器管理", callback_data: "menu:instances" }
  ]);
  return { inline_keyboard: rows };
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
  return "⚪️";
}

function statusActionRows(accountId: number, instanceId: number, status: string): Array<Array<{ text: string; callback_data: string }>> {
  if (status === "running") {
    return [
      [
        { text: "关机", callback_data: `instances:shutdown:${accountId}:${instanceId}` },
        { text: "重启", callback_data: `instances:reboot:${accountId}:${instanceId}` }
      ],
      [{ text: "删除", callback_data: `instances:confirm_delete:${accountId}:${instanceId}` }]
    ];
  }
  if (status === "offline") {
    return [
      [{ text: "开机", callback_data: `instances:boot:${accountId}:${instanceId}` }],
      [{ text: "删除", callback_data: `instances:confirm_delete:${accountId}:${instanceId}` }]
    ];
  }
  return [[{ text: "刷新", callback_data: `instances:detail:${accountId}:${instanceId}` }]];
}

function translateInstanceStatus(status: string): string {
  if (status === "running") return "运行中";
  if (status === "offline") return "已关机";
  if (status === "booting") return "开机中";
  if (status === "shutting_down") return "关机中";
  if (status === "rebooting") return "重启中";
  return status || "未知";
}
