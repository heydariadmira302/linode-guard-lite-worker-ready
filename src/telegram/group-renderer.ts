import type { AccountInstancesResult } from "../services/instance-service";
import type { PublicGroup } from "../services/group-service";
import type { TelegramInlineKeyboardMarkup } from "./types";

export function renderGroupsMenuText(groups: PublicGroup[]): string {
  return [
    "📁 分组管理",
    "",
    "分组是账号管理里的组织方式；普通添加账号默认进入未分组，从分组详情里添加账号会归入指定分组。分组详情里可以查看账号、查看服务器、执行分组批量操作。",
    "",
    groups.length ? groups.map((group) => `${group.is_default ? "⭐️" : "•"} ${group.name}（${group.account_count} 个账号）`).join("\n") : "暂无分组。",
    "",
    "默认分组：未分组",
    "一个账号只能属于一个分组。"
  ].join("\n");
}

export function renderGroupsMenuKeyboard(_groups: PublicGroup[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "查看分组列表", callback_data: "groups:list" }, { text: "新建分组", callback_data: "groups:create" }],
      [{ text: "⚡ 批量操作", callback_data: "menu:batch" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderGroupsListText(groups: PublicGroup[]): string {
  return [
    "📁 分组列表",
    "",
    groups.length ? groups.map((group) => `${group.is_default ? "⭐️" : "•"} ${group.name}（${group.account_count} 个账号）`).join("\n") : "暂无分组。"
  ].join("\n");
}

export function renderGroupsListKeyboard(groups: PublicGroup[]): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...groups.map((group) => [{ text: `${group.is_default ? "⭐️ " : ""}${group.name}（${group.account_count}）`, callback_data: `groups:detail:${group.id}` }]),
      [{ text: "新建分组", callback_data: "groups:create" }],
      [{ text: "⚡ 批量操作", callback_data: "menu:batch" }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

export function renderGroupDetailText(group: PublicGroup): string {
  return [
    "📁 分组详情",
    "",
    `名称：${group.name}`,
    `账号数量：${group.account_count}`,
    group.is_default ? "类型：默认分组" : "类型：普通分组",
    "",
    group.account_count > 0 ? "可以查看本组账号 / 服务器，也可以对本组服务器执行批量开关机或删除。" : "这个分组还没有账号，可以先添加账号或移动账号进来。"
  ].join("\n");
}

export function renderGroupDetailKeyboard(group: PublicGroup): TelegramInlineKeyboardMarkup {
  const rows = [
    [{ text: "添加账号到本组", callback_data: `accounts:add:to_group:${group.id}` }],
    [{ text: "查看本组账号", callback_data: `groups:accounts:${group.id}` }, { text: "查看本组服务器", callback_data: `groups:instances:${group.id}` }],
    [{ text: "本组批量开机", callback_data: `batch:group:boot:${group.id}` }, { text: "本组批量关机", callback_data: `batch:group:shutdown:${group.id}` }],
    [{ text: "本组批量删除", callback_data: `batch:group:delete:${group.id}` }]
  ];
  if (!group.is_default) {
    rows.push([{ text: "重命名", callback_data: `groups:rename:${group.id}` }]);
    rows.push([{ text: "删除分组", callback_data: `groups:delete_confirm:${group.id}` }]);
  }
  rows.push([{ text: "返回分组列表", callback_data: "groups:list" }, { text: "返回主菜单", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

export function renderGroupDeleteConfirmText(group: PublicGroup): string {
  return [
    "⚠️ 确认删除分组？",
    "",
    `分组：${group.name}`,
    `账号数量：${group.account_count}`,
    "",
    "只能删除空分组；删除后不会删除账号或服务器。"
  ].join("\n");
}

export function renderGroupDeleteConfirmKeyboard(group: PublicGroup): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "确认删除", callback_data: `groups:delete:${group.id}` }],
      [{ text: "取消", callback_data: `groups:detail:${group.id}` }],
      [{ text: "返回分组列表", callback_data: "groups:list" }]
    ]
  };
}

export function renderGroupAccountsText(group: PublicGroup, accounts: Array<{ id: number; alias: string; token_status: string }>): string {
  return [
    `📁 ${group.name} / 账号`,
    "",
    accounts.length ? accounts.map((account) => `#${account.id} ${account.alias}\nToken 状态：${formatTokenStatus(account.token_status)}`).join("\n\n") : "这个分组下暂无账号。"
  ].join("\n");
}

export function renderGroupAccountsKeyboard(group: PublicGroup): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "添加账号到本组", callback_data: `accounts:add:to_group:${group.id}` }], [{ text: "返回分组详情", callback_data: `groups:detail:${group.id}` }], [{ text: "返回分组列表", callback_data: "groups:list" }]] };
}

export function renderGroupSelectText(groups: PublicGroup[], alias?: string, presetGroup?: PublicGroup): string {
  return [
    "👤 添加账号 / 选择分组",
    "",
    alias ? `账号昵称：${alias}` : "请先选择账号所属分组。",
    presetGroup ? `当前推荐：${presetGroup.name}` : "",
    "",
    groups.length ? groups.map((group) => `${group.is_default ? "⭐️" : "•"} ${group.name}`).join("\n") : "暂无分组，将使用未分组。",
    "",
    "请选择一个分组。普通添加账号会默认进入未分组；如要归入指定分组，请从分组详情里点“添加账号到本组”。"
  ].filter(Boolean).join("\n");
}

export function renderGroupSelectKeyboard(groups: PublicGroup[], options: { presetGroupId?: number } = {}): TelegramInlineKeyboardMarkup {
  const sortedGroups = [...groups].sort((a, b) => {
    if (options.presetGroupId && a.id === options.presetGroupId) return -1;
    if (options.presetGroupId && b.id === options.presetGroupId) return 1;
    return a.id - b.id;
  });
  return {
    inline_keyboard: [
      ...sortedGroups.map((group) => [{ text: `${options.presetGroupId === group.id ? "✅ " : ""}${group.name}`, callback_data: `accounts:add:group:${group.id}` }]),
      [{ text: "取消", callback_data: "menu:accounts" }]
    ]
  };
}

export function renderGroupInstancesText(group: PublicGroup, results: AccountInstancesResult[]): string {
  const total = results.reduce((sum, result) => sum + result.instances.length, 0);
  if (results.length === 0 || total === 0) {
    return [
      `📁 ${group.name} / 服务器`,
      "",
      "这个分组下暂无服务器。",
      group.account_count === 0 ? "提示：这个分组下还没有账号。" : "提示：账号存在，但当前没有服务器。"
    ].join("\n");
  }
  return [
    `📁 ${group.name} / 服务器`,
    "",
    ...results.map((result) => [
      `账号：${result.account.alias}`,
      "",
      ...result.instances.map((instance) => [
        `${statusIcon(instance.status)} ${instance.label}`,
        `ID：${instance.id}`,
        `状态：${translateInstanceStatus(instance.status)}`,
        `地区：${instance.region}`,
        `IPv4：${instance.ipv4?.[0] ?? "-"}`,
        ""
      ].join("\n"))
    ].join("\n"))
  ].join("\n");
}

export function renderGroupInstancesKeyboard(group: PublicGroup, results: AccountInstancesResult[]): TelegramInlineKeyboardMarkup {
  const detailButtons = results.flatMap((result) => result.instances.map((instance) => [{ text: `详情 #${instance.id}`, callback_data: `instances:detail:${result.account.id}:${instance.id}` }]));
  return {
    inline_keyboard: [
      ...detailButtons,
      [{ text: "本组批量开机", callback_data: `batch:group:boot:${group.id}` }, { text: "本组批量关机", callback_data: `batch:group:shutdown:${group.id}` }],
      [{ text: "本组批量删除", callback_data: `batch:group:delete:${group.id}` }],
      [{ text: "返回分组详情", callback_data: `groups:detail:${group.id}` }],
      [{ text: "返回主菜单", callback_data: "menu:main" }]
    ]
  };
}

function formatTokenStatus(status: string): string {
  if (status === "valid") return "可用";
  if (status === "invalid") return "无效";
  if (status === "permission_error") return "权限不足";
  if (status === "unknown") return "未知";
  return status ? "未知状态" : "未知";
}

function statusIcon(status: string): string {
  if (status === "running") return "🟢";
  if (status === "offline") return "⚫️";
  if (["booting", "rebooting", "shutting_down", "provisioning", "migrating", "rebuilding", "cloning", "restoring", "deleting"].includes(status)) return "🟡";
  return "⚪️";
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
