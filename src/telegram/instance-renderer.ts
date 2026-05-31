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
  ].filter(Boolean).join("\n");
}

export function renderInstancesMenuKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🖥 查看全部服务器", callback_data: "instances:list:all" }],
      [{ text: "➕ 创建 Linux 服务器", callback_data: "instances:create" }],
      [{ text: "🪟 创建 Windows 服务器", callback_data: "windows:create" }],
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
    primaryConnectionLines(instance.ipv4?.[0]),
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


export interface CreateInstanceChoice {
  id: string | number;
  label: string;
  country?: string;
  site_type?: string;
  disk?: number;
  memory?: number;
  vcpus?: number;
  transfer?: number;
  network_out?: number;
  price?: { monthly?: number };
  deprecated?: boolean;
}

export function renderCreateInstanceAccountText(accounts: PublicAccount[]): string {
  return ["➕ 创建服务器", "━━━━━━━━━━━━", "先选择要用哪个 Linode 账号创建服务器。", "", accounts.length ? accounts.map((account) => `#${account.id} ${account.alias}${account.group_name ? `（${account.group_name}）` : ""}`).join("\n") : "暂无启用中的 Linode 账号，请先添加账号。"].join("\n");
}

export function renderCreateInstanceAccountKeyboard(accounts: PublicAccount[]): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [...accounts.map((account) => [{ text: `👤 #${account.id} ${account.alias}`, callback_data: `instances:create:account:${account.id}` }]), [{ text: "↩️ 返回服务器管理", callback_data: "menu:instances" }]] };
}


export function renderWindowsVersionText(): string {
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    "步骤 1/6：选择 Windows 版本",
    "",
    "稳定路线：Windows Server 2022 Evaluation。",
    "实验路线：Windows 11 Enterprise LTSC 2024，Bot 会自动查找官方 ISO，不需要你输入 ISO URL。"
  ].join("\n");
}

export function renderWindowsVersionKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "🪟 Windows Server 2022", callback_data: `windows:create:version:${accountId}:2k22` }],
    [{ text: "🧪 Windows 11 LTSC 2024", callback_data: `windows:create:version:${accountId}:w11-ltsc-2024` }],
    [{ text: "⬅️ 上一步：账号", callback_data: "windows:create" }],
    [{ text: "❌ 取消", callback_data: "menu:instances" }]
  ] };
}

export function renderWindowsLanguageText(): string {
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    "步骤 2/6：选择 Windows 11 语言",
    "",
    "Bot 会自动查找官方 Windows 11 ISO，不需要你输入 ISO URL。",
    "解析失败时会提示稍后重试，不会创建收费 Linode。"
  ].join("\n");
}

export function renderWindowsLanguageKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "🇨🇳 简体中文 zh-cn", callback_data: `windows:create:lang:${accountId}:zh-cn` }],
    [{ text: "🇺🇸 English en-us", callback_data: `windows:create:lang:${accountId}:en-us` }],
    [{ text: "⬅️ 上一步：版本", callback_data: `windows:create:account:${accountId}` }],
    [{ text: "❌ 取消", callback_data: "menu:instances" }]
  ] };
}

export function renderCreateRegionText(regions: CreateInstanceChoice[], page = 0): string {
  const items = pageItems(filterRegions(regions), page, 12);
  return ["➕ 创建 Linux 服务器", "━━━━━━━━━━━━", "步骤 1/4：选择地区", "", "按钮为短名，本页完整名称：", ...items.map((item, idx) => `${idx + 1}. ${item.label}｜${item.id}`)].join("\n");
}

export function renderCreateRegionKeyboard(accountId: number, regions: CreateInstanceChoice[], page = 0): TelegramInlineKeyboardMarkup {
  const filtered = filterRegions(regions);
  const items = pageItems(filtered, page, 12);
  const rows = chunkButtons(items.map((item, idx) => ({ text: `${idx + 1}. ${shortText(item.label, 18)}`, callback_data: `instances:create:region:${accountId}:${item.id}` })), 2);
  addPagination(rows, `instances:create:region_page:${accountId}`, page, filtered.length, 12);
  rows.push([{ text: "❌ 取消", callback_data: "menu:instances" }]);
  return { inline_keyboard: rows };
}

export function renderCreateTypeText(types: CreateInstanceChoice[], state: Record<string, unknown>, page = 0): string {
  return ["➕ 创建 Linux 服务器", "━━━━━━━━━━━━", "步骤 2/4：选择套餐", "", `地区：${state.region_label ?? state.region ?? "未选择"}`, "格式：CPU / 内存 / 流量 / 月费"].join("\n");
}

export function renderCreateTypeKeyboard(accountId: number, types: CreateInstanceChoice[], state: Record<string, unknown>, page = 0): TelegramInlineKeyboardMarkup {
  const filtered = filterTypes(types);
  const items = pageItems(filtered, page, 8);
  const rows = items.map((item) => [{ text: formatTypeButton(item), callback_data: `instances:create:type:${accountId}:${item.id}` }]);
  addPagination(rows, `instances:create:type_page:${accountId}`, page, filtered.length, 8);
  rows.push([{ text: "⬅️ 上一步：地区", callback_data: `instances:create:account:${accountId}` }]);
  rows.push([{ text: "❌ 取消", callback_data: "menu:instances" }]);
  return { inline_keyboard: rows };
}

export function renderCreateImageText(images: CreateInstanceChoice[], state: Record<string, unknown>, page = 0): string {
  const items = pageItems(filterImages(images), page, 12);
  return ["➕ 创建 Linux 服务器", "━━━━━━━━━━━━", "步骤 3/4：选择系统", "", `地区：${state.region_label ?? state.region ?? "未选择"}`, `套餐：${state.type_label ?? state.type ?? "未选择"}`, "", "按钮为短名，本页完整名称：", ...items.map((item, idx) => `${idx + 1}. ${item.label}`)].join("\n");
}

export function renderCreateImageKeyboard(accountId: number, images: CreateInstanceChoice[], page = 0): TelegramInlineKeyboardMarkup {
  const filtered = filterImages(images);
  const items = pageItems(filtered, page, 12);
  const rows = chunkButtons(items.map((item, idx) => ({ text: `${idx + 1}. ${shortText(item.label, 18)}`, callback_data: `instances:create:image:${accountId}:${item.id}` })), 2);
  addPagination(rows, `instances:create:image_page:${accountId}`, page, filtered.length, 12);
  rows.push([{ text: "⬅️ 上一步：套餐", callback_data: `instances:create:back_type:${accountId}` }]);
  rows.push([{ text: "❌ 取消", callback_data: "menu:instances" }]);
  return { inline_keyboard: rows };
}

export function renderCreateFirewallText(state: Record<string, unknown>): string {
  return ["➕ 创建 Linux 服务器", "━━━━━━━━━━━━", "步骤 4/4：选择防火墙", "", `地区：${state.region_label ?? state.region ?? "未选择"}`, `套餐：${state.type_label ?? state.type ?? "未选择"}`, `系统：${state.image_label ?? state.image ?? "未选择"}`].join("\n");
}

export function renderCreateFirewallKeyboard(accountId: number, firewalls: CreateInstanceChoice[]): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardButton[][] = [[{ text: "不使用防火墙", callback_data: `instances:create:firewall:${accountId}:none` }]];
  rows.push(...chunkButtons(firewalls.slice(0, 20).map((item) => ({ text: shortText(item.label, 32), callback_data: `instances:create:firewall:${accountId}:${item.id}` })), 1));
  rows.push([{ text: "⬅️ 上一步：系统", callback_data: `instances:create:back_image:${accountId}` }]);
  rows.push([{ text: "❌ 取消", callback_data: "menu:instances" }]);
  return { inline_keyboard: rows };
}

export function renderCreateConfirmText(account: PublicAccount, state: Record<string, unknown>): string {
  return ["➕ 创建 Linux 服务器", "━━━━━━━━━━━━", `账号：#${account.id} ${account.alias}`, `名称：${state.label ?? "自动生成"}`, `地区：${state.region_label ?? state.region}`, `套餐：${state.type_label ?? state.type}`, `系统：${state.image_label ?? state.image}`, `防火墙：${state.firewall_label ?? "不使用防火墙"}`, "Root 密码：创建时自动生成，成功后只显示一次", "", "⚠️ 确认创建后会调用 Linode API，并可能产生费用。"].join("\n");
}

export function renderCreateConfirmKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "✅ 确认创建", callback_data: `instances:create:confirm:${accountId}`, style: "success" }], [{ text: "⬅️ 上一步：防火墙", callback_data: `instances:create:back_firewall:${accountId}` }], [{ text: "❌ 取消", callback_data: "menu:instances" }]] };
}




export function renderWindowsCredentialModeText(state: Record<string, unknown>): string {
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    "步骤：设置登录凭据",
    "",
    `Windows：${state.windows_version_label ?? "Windows Server 2022 Evaluation"}`,
    state.windows_version === "w11-ltsc-2024" ? `语言：${state.windows_lang ?? "en-us"}` : null,
    "",
    "推荐使用自动生成强密码，安全且不容易因为特殊字符转义导致安装后无法登录。",
    "如果选择自己输入，Bot 会尝试删除你发送的密码消息，但 Telegram 聊天里仍可能短暂出现。"
  ].filter(Boolean).join("\n");
}

export function renderWindowsCredentialModeKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [
    [{ text: "🔐 自动生成强密码（推荐）", callback_data: `windows:create:cred:${accountId}:auto` }],
    [{ text: "✍️ 自己输入密码", callback_data: `windows:create:cred:${accountId}:custom` }],
    [{ text: "❌ 取消", callback_data: "menu:instances" }]
  ] };
}

export function renderWindowsPasswordPromptText(): string {
  return [
    "✍️ 输入 Windows 登录密码",
    "━━━━━━━━━━━━",
    "请发送你想设置的密码。",
    "",
    "要求：10-64 位，必须包含大写字母、小写字母、数字和符号。",
    "支持符号：! @ # $ % ^ * _ - + = ?",
    "不要包含空格、中文、< > & 引号。",
    "",
    "收到后我会尽量删除你发来的密码消息。"
  ].join("\n");
}

export function renderWindowsPasswordPromptKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ 改为自动生成", callback_data: `windows:create:cred:${accountId}:auto` }], [{ text: "❌ 取消", callback_data: "menu:instances" }]] };
}

export function renderWindowsCreateTypeText(state: Record<string, unknown>): string {
  const isW11 = state.windows_version === "w11-ltsc-2024";
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    isW11 ? "步骤 4/6：选择服务器配置" : "步骤 3/5：选择服务器配置",
    "",
    `Windows：${state.windows_version_label ?? "Windows Server 2022 Evaluation"}`,
    isW11 ? `语言：${state.windows_lang ?? "en-us"}` : null,
    `地区：${state.region_label ?? state.region ?? "未选择"}`,
    isW11 ? "最低建议：4GB / 80GB，推荐 8GB+" : "最低建议：4GB 内存 / 80GB 磁盘以上",
    "格式：CPU / 内存 / 流量 / 月费"
  ].filter(Boolean).join("\n");
}

export function renderWindowsCreateFirewallText(state: Record<string, unknown>): string {
  const isW11 = state.windows_version === "w11-ltsc-2024";
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    isW11 ? "步骤 5/6：选择防火墙" : "步骤 4/5：选择防火墙",
    "",
    `Windows：${state.windows_version_label ?? "Windows Server 2022 Evaluation"}`,
    isW11 ? `语言：${state.windows_lang ?? "en-us"}` : null,
    `地区：${state.region_label ?? state.region ?? "未选择"}`,
    `配置：${state.type_label ?? state.type ?? "未选择"}`
  ].filter(Boolean).join("\n");
}

export function renderWindowsCreateConfirmText(account: PublicAccount, state: Record<string, unknown>): string {
  const isW11 = state.windows_version === "w11-ltsc-2024";
  return [
    "🪟 创建 Windows 服务器",
    "━━━━━━━━━━━━",
    `账号：#${account.id} ${account.alias}`,
    `名称：${state.label ?? "自动生成"}`,
    `Windows：${state.windows_version_label ?? "Windows Server 2022 Evaluation"}`,
    isW11 ? `语言：${state.windows_lang ?? "en-us"}` : null,
    "基础镜像：Ubuntu 22.04 + 私有 StackScript",
    isW11 ? "ISO：Bot 会自动查找官方 ISO，不需要你输入 ISO URL" : null,
    `地区：${state.region_label ?? state.region}`,
    `配置：${state.type_label ?? state.type}`,
    `防火墙：${state.firewall_label ?? "不使用防火墙"}`,
    `Windows 用户名：${state.windows_username ?? "Administrator"}`,
    `密码：${state.administrator_password ? "用户自定义（只显示一次）" : "自动生成（只显示一次）"}`,
    "",
    "⚠️ 确认后会调用 Linode API 创建收费 Linode。",
    isW11 ? "⚠️ Windows 11 是非官方实验路线，成功率低于 Windows Server 2022。" : null,
    isW11 ? "⚠️ 安装预计 20-40 分钟，多次重启属正常。" : "⚠️ StackScript 会把新建 Ubuntu 机器转换为 Windows，安装约 15-30 分钟，中途多次重启属正常。",
    "⚠️ 安装脚本会临时使用当前 Linode Token 调用 Linode API 配置磁盘/启动项。",
    "🔐 Administrator 密码和临时 Ubuntu root 密码只会在创建成功消息里显示一次，请立即复制保存。"
  ].filter(Boolean).join("\n");
}

export function renderWindowsCreateConfirmKeyboard(accountId: number): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "✅ 确认创建 Windows", callback_data: `windows:create:confirm:${accountId}`, style: "success" }], [{ text: "⬅️ 上一步：防火墙", callback_data: `instances:create:back_firewall:${accountId}` }], [{ text: "❌ 取消", callback_data: "menu:instances" }]] };
}

export function renderWindowsCreatedText(result: { account: PublicAccount; instance: LinodeInstance; windows_version_label?: string; windows_version?: string; windows_lang?: string; windows_username?: string; administrator_password: string; temp_root_password: string }): string {
  const ip = result.instance.ipv4?.[0] ?? "创建后稍后在 Linode 面板查看";
  return [
    "✅ Windows 创建请求已提交",
    "━━━━━━━━━━━━",
    `账号：#${result.account.id} ${result.account.alias}`,
    `服务器：${result.instance.label} (${result.instance.id})`,
    `状态：${translateInstanceStatus(result.instance.status)}`,
    `地区：${result.instance.region}`,
    `公网 IP：${ip}`,
    "RDP：3389（安装完成后连接）",
    `用户名：${result.windows_username ?? "Administrator"}`,
    "",
    "⚠️ 重要：下面两个密码不会再次显示，请立刻复制保存。",
    "如果关闭/清理消息后忘记密码，需要通过 Linode 控制台重置或重装。",
    "",
    "🔐 Administrator 密码（只显示一次，请立即保存）：",
    result.administrator_password,
    "",
    "🛠 临时 Ubuntu root 密码（只显示一次，调试用）：",
    result.temp_root_password,
    "",
    "⚠️ 再提醒一次：请现在保存密码，这条消息之后不会提供找回入口。",
    "",
    `Windows：${result.windows_version_label ?? "Windows Server 2022 Evaluation"}`,
    result.windows_version === "w11-ltsc-2024" ? `语言：${result.windows_lang}` : null,
    result.windows_version === "w11-ltsc-2024" ? "预计安装耗时：20-40 分钟，中途重启属于正常现象。" : "预计安装耗时：15-30 分钟，中途重启属于正常现象。",
    "如果 30 分钟后仍无法 RDP，需要进 Linode LISH/控制台查看 StackScript 日志。"
  ].join("\n");
}

export function renderCreatedInstanceText(result: { account: PublicAccount; instance: LinodeInstance; root_password?: string }): string {
  return ["✅ 创建请求已提交", "━━━━━━━━━━━━", `账号：#${result.account.id} ${result.account.alias}`, `服务器：${result.instance.label} (${result.instance.id})`, `状态：${translateInstanceStatus(result.instance.status)}`, `地区：${result.instance.region}`, `IPv4：${result.instance.ipv4?.join(", ") || "等待分配"}`, "", "🔐 临时 root 密码：", result.root_password ?? "只通过 API 响应返回一次", "", "请尽快登录后修改密码。"].join("\n");
}

function filterRegions(regions: CreateInstanceChoice[]): CreateInstanceChoice[] {
  const publicRegions = regions.filter((item) => !item.site_type || item.site_type === "core");
  return (publicRegions.length ? publicRegions : regions).sort((a, b) => String(a.country ?? "").localeCompare(String(b.country ?? "")) || String(a.label).localeCompare(String(b.label)));
}

function filterTypes(types: CreateInstanceChoice[]): CreateInstanceChoice[] {
  const standard = types.filter((item) => String(item.id).startsWith("g6-"));
  return (standard.length ? standard : types).sort((a, b) => Number(a.price?.monthly ?? 0) - Number(b.price?.monthly ?? 0));
}

function filterImages(images: CreateInstanceChoice[]): CreateInstanceChoice[] {
  const linux = images.filter((item) => String(item.id).startsWith("linode/") && !item.deprecated);
  const priority = ["ubuntu24.04", "ubuntu22.04", "debian13", "debian12", "almalinux9", "rocky9"];
  return (linux.length ? linux : images).sort((a, b) => imageRank(String(a.id), priority) - imageRank(String(b.id), priority) || String(a.label).localeCompare(String(b.label)));
}

function imageRank(id: string, priority: string[]): number {
  const rank = priority.findIndex((token) => id.includes(token));
  return rank === -1 ? priority.length : rank;
}

function pageItems<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice(page * pageSize, page * pageSize + pageSize);
}

function addPagination(rows: TelegramInlineKeyboardButton[][], prefix: string, page: number, total: number, pageSize: number): void {
  const nav: TelegramInlineKeyboardButton[] = [];
  if (page > 0) nav.push({ text: "上一页", callback_data: `${prefix}:${page - 1}` });
  if ((page + 1) * pageSize < total) nav.push({ text: "下一页", callback_data: `${prefix}:${page + 1}` });
  if (nav.length) rows.push(nav);
}

function chunkButtons(buttons: TelegramInlineKeyboardButton[], size: number): TelegramInlineKeyboardButton[][] {
  const rows: TelegramInlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += size) rows.push(buttons.slice(i, i + size));
  return rows;
}

function shortText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function formatTypeButton(item: CreateInstanceChoice): string {
  const memory = typeof item.memory === "number" ? `${Math.round(item.memory / 1024)}G` : "?";
  const transfer = typeof item.transfer === "number" ? `${item.transfer}G` : "?";
  const price = typeof item.price?.monthly === "number" ? `$${item.price.monthly}/月` : "价格未知";
  return `${item.vcpus ?? "?"}H ${memory} / ${transfer} / ${price}`;
}


function primaryConnectionLines(primaryIpv4?: string): string {
  if (!primaryIpv4) return "• 连接：等待分配公网 IPv4 后显示";
  return [
    `• SSH：ssh root@${primaryIpv4}`,
    `• RDP：${primaryIpv4}:3389`,
    "• Windows 用户名：Administrator"
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
