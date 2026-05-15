import type { LinodeInstance } from "../clients/linode-client";
import type { AccountInstancesResult, InstanceDetailResult } from "../services/instance-service";
import type { PublicAccount } from "../services/account-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderInstancesMenuText(): string {
  return [
    "服务器管理",
    "",
    "当前 Phase 6 仅支持只读查看服务器。",
    "不会执行开机、关机、重启或删除。"
  ].join("\n");
}

export function renderInstancesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看全部服务器", callback_data: "instances:list:all" }],
      [{ text: "选择账号", callback_data: "instances:accounts" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderInstanceAccountsText(accounts: PublicAccount[]): string {
  return [
    "选择账号查看服务器",
    "",
    accounts.length ? accounts.map((account) => `#${account.id} ${account.alias}`).join("\n") : "暂无 active Linode 账号。"
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

export function renderAllInstancesText(results: AccountInstancesResult[]): string {
  if (results.length === 0) return "服务器列表\n\n暂无 active Linode 账号。";
  return [
    "服务器列表",
    "",
    ...results.map((result) => renderAccountInstanceBlock(result.account.alias, result.instances))
  ].join("\n");
}

export function renderAccountInstancesText(result: AccountInstancesResult): string {
  return [
    "服务器列表",
    "",
    renderAccountInstanceBlock(result.account.alias, result.instances)
  ].join("\n");
}

export function renderInstancesListKeyboard(results: AccountInstancesResult[]): TelegramInlineKeyboardMarkup {
  const detailButtons = results.flatMap((result) => result.instances.map((instance) => [{
    text: `详情 #${instance.id}`,
    callback_data: `instances:detail:${result.account.id}:${instance.id}`
  }]));
  return {
    inline_keyboard: [
      ...detailButtons,
      [{ text: "返回服务器管理", callback_data: "menu:instances" }]
    ]
  };
}

export function renderInstanceDetailText(result: InstanceDetailResult): string {
  const instance = result.instance;
  return [
    "服务器详情",
    "",
    `账号：#${result.account.id} ${result.account.alias}`,
    `ID：${instance.id}`,
    `名称：${instance.label}`,
    `状态：${instance.status}`,
    `区域：${instance.region}`,
    `规格：${instance.type}`,
    instance.ipv4?.length ? `IPv4：${instance.ipv4.join(", ")}` : "IPv4：-",
    instance.ipv6 ? `IPv6：${instance.ipv6}` : "IPv6：-",
    instance.image ? `镜像：${instance.image}` : "镜像：-",
    instance.created ? `创建时间：${instance.created}` : "创建时间：-",
    instance.updated ? `更新时间：${instance.updated}` : "更新时间：-",
    instance.tags?.length ? `标签：${instance.tags.join(", ")}` : "标签：-",
    ...renderSpecsLines(instance.specs)
  ].join("\n");
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

function renderAccountInstanceBlock(accountAlias: string, instances: LinodeInstance[]): string {
  if (instances.length === 0) {
    return [`账号：${accountAlias}`, "暂无服务器。", ""].join("\n");
  }
  return [
    `账号：${accountAlias}`,
    "",
    ...instances.map((instance) => [
      `#${instance.id} ${instance.label}`,
      `状态：${instance.status}`,
      `区域：${instance.region}`,
      `规格：${instance.type}`,
      ""
    ].join("\n"))
  ].join("\n");
}
