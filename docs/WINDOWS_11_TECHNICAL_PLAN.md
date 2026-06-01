# Linode Guard Lite：Telegram 创建 Linode Win11 服务器完整技术方案

状态：完整设计方案，尚未实现  
目标：通过 Telegram Bot 创建 Linode Windows 11 服务器，用户不需要手动查找 ISO、不需要 SSH、不需要执行重装脚本。  
核心原则：API-first / Service-first；Telegram 只是展示和交互窗口。

---

## 0. 结论摘要

我们要做的不是“把 kejilion / bin456789 / leitbogioro 脚本原样塞进 Bot”，而是：

```text
Telegram 选择参数
→ WindowsInstanceService 处理业务
→ WindowsIsoResolverService 自动解析官方 ISO
→ Linode API 创建 Ubuntu 22.04 + 私有 StackScript 实例
→ StackScript 自动完成 Windows 11 安装
```

主路线：

- **Linode 专用 StackScript 架构**：以 `kitknox/winode` / Linode 社区 Windows StackScript 为主参考。
- **ISO 自动解析体验**：参考 `bin456789/reinstall`，自动查找官方 Windows 11 ISO，不让用户输入 URL。
- **DD/InstallNET 经验**：参考 `leitbogioro/Tools`，但不直接执行其脚本。
- **项目架构**：继续保持 Linode Guard Lite 的 API-first / Service-first，不把逻辑堆在 Telegram callback。

MVP：

- Windows Server 2022 Evaluation：稳定路线。
- Windows Server 2025 简体中文版 / English：新增实验路线。
- Windows 11 Enterprise LTSC 2024：实验路线。
- 语言：`zh-cn`、`en-us`。
- 用户无需输入 ISO URL。
- 密码随机生成，只显示一次，不落库。
- 创建高危审计。

---

## 1. 目标与非目标

## 1.1 用户目标

用户在 Telegram 中完成：

```text
🪟 创建 Windows 服务器
→ 选择 Windows 版本
→ 选择语言
→ 选择地区
→ 选择配置
→ 选择防火墙
→ 确认
→ Bot 创建 Linode Win11
→ 返回一次性密码和 RDP 信息
```

用户不需要：

- 手动找 Microsoft ISO。
- 手动粘贴 ISO URL。
- SSH 到机器执行 `bash <(curl ...)`。
- 手动 DD。
- 手动改 Linode config。
- 看懂 StackScript。

## 1.2 架构目标

必须保持：

```text
Core API / Service
→ Linode API / D1 / StackScript
→ Telegram UI
```

Telegram 层只负责：

- 展示菜单。
- 收集选择。
- 高危确认。
- 显示创建结果。

Telegram 层不负责：

- 解析 ISO。
- 拼接 Linode API payload。
- 处理 StackScript 细节。
- 保存密码。
- 保存 token。

## 1.3 非目标

本阶段不做：

- 已有机器一键重装 Windows。
- Worker 直接 SSH 到 Linode 执行脚本。
- 直接接入 kejilion 大菜单。
- Windows 11 ARM。
- 默认使用第三方公开 DD 镜像。
- 自动激活 Windows。
- Web 后台。
- 手动 ISO URL 默认入口。

后续可以单独评估：

- 高级模式：生成 bin456789/reinstall 手动命令。
- 高级模式：手动 ISO URL 兜底。
- 安装进度追踪。
- 自动短期安装 token。
- Windows Server 2025。

---

## 2. 参考项目与采用策略

## 2.1 Linode 社区 Windows StackScript / kitknox/winode

主参考：

- GitHub: https://github.com/kitknox/winode
- Linode 社区问题中提及的 Windows 11 Community StackScript 与该项目同源。

它是最贴近本项目目标的方案，因为它本身就是：

```text
Automated BYO License Windows Install on Linode - Launchable from Stackscripts
```

### 可借鉴能力

- Ubuntu 22.04 StackScript 启动。
- 创建临时 Block Storage Volume。
- `rsync` 当前 Linux 到临时卷。
- 创建 `BLOCK` config。
- 删除原 Linux root/swap disk。
- 创建 raw Windows disk。
- 创建/更新 `Windows` config。
- 下载 Microsoft ISO。
- 注入 VirtIO 驱动。
- 写 `autounattend.xml`。
- 使用 `linode/direct-disk` 最终启动。
- 启用 RDP 3389。
- 启用 EMS/LISH 恢复能力。
- Windows 11 硬件绕过。
- 多阶段 `STAGE=1/2/3` 安装流程。

### 必须修正/增强

不能原样照搬，需要修正：

- 聊天/网页复制版本里有明显损坏，不可作为源码。
- `Win11 autounattend.xml` 中疑似脏字符：`[B<?xml...`。
- Win11 镜像名写死为 `Windows 10 Pro`，必须参数化。
- `/t REG_DWORD` 在旧片段里有被破坏为 `_dword` 的风险。
- token/password/url 转义要更严谨。
- Linode busy / reboot retry 要保留最新版逻辑。
- 临时 volume 清理要完善。
- 日志和审计不得泄露 token/password。
- 用户不应输入 `W11_ISO_URL`，由 Service 自动解析。

### 采用策略

- 以 `kitknox/winode` 最新版结构为主参考。
- 不使用用户聊天里粘贴的破损旧脚本作为源码。
- 不直接使用 Linode public Community StackScript。
- 本项目为每个 Linode 账号创建/更新自己的私有 StackScript。

---

## 2.2 bin456789/reinstall

项目：

- https://github.com/bin456789/reinstall

这是 ISO 自动解析和 Windows 安装体验的重要参考。

### 可借鉴能力

- Windows ISO 自动查找。
- 用户只传 `image-name + lang`，不需要 ISO URL。
- 支持 Windows 10 / 11 / Server 2019 / 2022 / 2025。
- 支持官方 ISO，而不是自制镜像。
- 自动 VirtIO / 云驱动处理经验。
- Windows 11 硬件限制绕过。
- 随机密码逻辑。
- RDP 端口参数。
- 静态 IP / DHCP 复杂环境适配经验。
- 日志观察和救援思路。

示例体验：

```bash
bash reinstall.sh windows \
  --image-name "Windows 11 Enterprise LTSC 2024" \
  --lang zh-cn
```

脚本会从官方 ISO 索引中自动查找下载链接。

### 采用策略

- 借鉴 ISO resolver 思路。
- 借鉴 `image-name + lang` 交互模型。
- 不直接执行 `reinstall.sh`。
- 不把 GPL 脚本代码复制进 MIT 项目。
- 不通过 Worker SSH 到机器执行脚本。

---

## 2.3 leitbogioro/Tools

项目：

- https://github.com/leitbogioro/Tools

这是 InstallNET / DD / 一键重装经验参考。

### 可借鉴能力

- Windows / Linux 重装菜单设计。
- 语言参数设计。
- 中转 Linux / DD / netboot 思路。
- 多云网络配置经验。
- 低配 VPS 适配经验。

### 不采用为主路线的原因

- 更适合 SSH 到已有 VPS 执行。
- 默认密码公开，例如 公开默认密码 等，不适合我们默认体验。
- 不专门针对 Linode API 创建新实例。
- GPL 许可需要谨慎。

### 采用策略

- 作为辅助参考和致谢。
- 不直接执行。
- 不使用默认公开密码。

---

## 3. Linode / Akamai 官方能力复核

## 3.1 Create Instance API

官方 `POST /linode/instances` 支持本路线需要的关键字段：

- `region`
- `type`
- `image`
- `root_pass`
- `firewall_id`
- `stackscript_id`
- `stackscript_data`
- `metadata.user_data`
- `authorized_keys`
- `authorized_users`
- `booted`
- `disk_encryption`

因此，Windows 创建可继续使用：

```text
官方 Create Instance API
→ Ubuntu 22.04 基础镜像
→ 私有 StackScript
→ stackscript_data 传安装参数
→ 首次启动执行 Windows 安装逻辑
```

## 3.2 StackScript 限制

官方 StackScripts 仍可用，但需注意：

- StackScripts 在新 Linode 首次启动时执行。
- StackScripts 需要绑定兼容 Linux image。
- `stackscript_id` 必须兼容所选 `image`。
- 使用 StackScript 时不适合从 backup/private image 部署。
- StackScripts 只适用于 core compute regions。
- 不适用于 distributed compute regions。
- public StackScript 创建后不能改回 private。

项目要求：

- 默认只创建 private StackScript。
- 使用 `linode/ubuntu22.04` 作为基础镜像。
- Region 选择过滤 `site_type !== "core"` 的 region。
- 创建前做 Service 层校验。

## 3.3 Metadata / cloud-init

Akamai 官方现在建议普通 Linux 初始化优先考虑 Metadata + cloud-init。

但 Win11 路线需要：

- 改 disk/config/volume。
- 删除/创建 raw disk。
- 多阶段 reboot。
- direct-disk 切换。
- 注入 ISO 和 VirtIO。

这些更适合 StackScript。结论：

- Linux 创建后的轻量配置，未来可考虑 metadata/cloud-init。
- Windows Server/Win11 自动安装，继续用 StackScript。

## 3.4 Windows 官方支持状态

Linode/Akamai 没有普通官方 Windows image。

文案必须准确：

```text
Windows 创建使用非官方自动化路线。
它基于官方 Linode API + 私有 StackScript 创建 Linux 实例后转换为 Windows。
Windows Server 2022 为稳定路线；Windows 11 初期标记为实验路线。
```

---

## 4. 总体架构

```text
Telegram UI
  ↓
Telegram callbacks / bot session
  ↓
WindowsInstanceService
  ↓
WindowsIsoResolverService
  ↓
D1 settings cache
  ↓
Linode API
  ↓
Private StackScript
  ↓
Ubuntu 22.04 temporary install environment
  ↓
Windows installation
```

核心模块：

- `WindowsInstanceService`
- `WindowsIsoResolverService`
- `LinodeClient`
- `SettingsRepository`
- `AuditService`
- Telegram renderers/callbacks
- Private StackScript template

---

## 5. Windows 版本模型

## 5.1 版本枚举

```ts
export type WindowsInstallVersion = "2k22" | "w11-ltsc-2024";
```

## 5.2 语言枚举

```ts
export type WindowsLanguage = "zh-cn" | "en-us";
```

## 5.3 版本定义

```ts
interface WindowsVersionOption {
  id: WindowsInstallVersion;
  label: string;
  stackscript_version: "2k22" | "w11";
  image_name: string;
  stability: "stable" | "experimental";
  languages: WindowsLanguage[];
  default_language: WindowsLanguage;
  requires_iso_resolve: boolean;
  min_memory_mb: number;
  recommended_memory_mb?: number;
  min_disk_mb: number;
  estimated_minutes: string;
}
```

初始：

```ts
const WINDOWS_VERSIONS = [
  {
    id: "2k22",
    label: "Windows Server 2022 Evaluation",
    stackscript_version: "2k22",
    image_name: "Windows Server 2022 SERVERDATACENTER",
    stability: "stable",
    languages: ["en-us"],
    default_language: "en-us",
    requires_iso_resolve: false,
    min_memory_mb: 4096,
    min_disk_mb: 81920,
    estimated_minutes: "15-30"
  },
  {
    id: "w11-ltsc-2024",
    label: "Windows 11 Enterprise LTSC 2024",
    stackscript_version: "w11",
    image_name: "Windows 11 Enterprise LTSC 2024",
    stability: "experimental",
    languages: ["zh-cn", "en-us"],
    default_language: "zh-cn",
    requires_iso_resolve: true,
    min_memory_mb: 4096,
    recommended_memory_mb: 8192,
    min_disk_mb: 81920,
    estimated_minutes: "20-40"
  }
];
```

---

## 6. API 设计

## 6.1 获取 Windows 版本

```http
GET /api/v1/windows/versions
```

响应：

```json
{
  "ok": true,
  "data": {
    "versions": [
      {
        "id": "2k22",
        "label": "Windows Server 2022 Evaluation",
        "stability": "stable",
        "languages": ["en-us"],
        "min_memory_mb": 4096,
        "min_disk_mb": 81920,
        "estimated_minutes": "15-30"
      },
      {
        "id": "w11-ltsc-2024",
        "label": "Windows 11 Enterprise LTSC 2024",
        "stability": "experimental",
        "languages": ["zh-cn", "en-us"],
        "min_memory_mb": 4096,
        "recommended_memory_mb": 8192,
        "min_disk_mb": 81920,
        "estimated_minutes": "20-40",
        "iso_resolved_automatically": true
      }
    ]
  }
}
```

## 6.2 获取 Windows 创建选项

```http
GET /api/v1/accounts/:account_id/windows/create-options?version=w11-ltsc-2024&lang=zh-cn
```

返回：

```json
{
  "ok": true,
  "data": {
    "account": {},
    "stackscript": {},
    "selected_version": "w11-ltsc-2024",
    "selected_language": "zh-cn",
    "iso_resolve_required": true,
    "iso_cached": true,
    "regions": [],
    "types": [],
    "firewalls": []
  }
}
```

## 6.3 创建 Windows 实例

```http
POST /api/v1/accounts/:account_id/windows/instances
```

请求：

```json
{
  "version": "w11-ltsc-2024",
  "lang": "zh-cn",
  "region": "jp-osa",
  "type": "g6-dedicated-4",
  "firewall_id": null
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "account": {},
    "instance": {},
    "windows_version": "w11-ltsc-2024",
    "windows_version_label": "Windows 11 Enterprise LTSC 2024",
    "windows_language": "zh-cn",
    "administrator_password": "只显示一次",
    "temp_root_password": "只显示一次",
    "estimated_minutes": "20-40"
  }
}
```

## 6.4 可选：ISO 状态接口

MVP 不一定需要单独暴露。若需要排查，可只做内部 service，不加公开 API。

避免之前“手动触发部署通知接口”的问题：任何诊断/触发接口都必须先确认再做。

---

## 7. WindowsIsoResolverService 设计

## 7.1 职责

自动解析 Windows 11 官方 ISO URL，不让用户输入。

```ts
class WindowsIsoResolverService {
  async resolve(input: ResolveWindowsIsoInput): Promise<ResolvedWindowsIso>;
}
```

```ts
interface ResolveWindowsIsoInput {
  version: "w11-ltsc-2024";
  lang: "zh-cn" | "en-us";
  requestId: string;
  forceRefresh?: boolean;
}

interface ResolvedWindowsIso {
  version: "w11-ltsc-2024";
  lang: "zh-cn" | "en-us";
  image_name: "Windows 11 Enterprise LTSC 2024";
  iso_url: string;
  source: "cache" | "massgrave";
  resolved_at: string;
  expires_at: string;
}
```

## 7.2 解析来源

参考 bin456789：

- `https://massgrave.dev/genuine-installation-media`
- `https://massgrave.dev/windows_11_links`

匹配条件：

- Windows 11 Enterprise LTSC 2024
- x64
- `zh-cn` 或 `en-us`
- URL 为 `https://`
- 优先 Microsoft 官方下载域名：
  - `software.download.prss.microsoft.com`
  - `download.microsoft.com`

## 7.3 缓存

D1 settings key：

```text
windows_iso_cache:w11-ltsc-2024:zh-cn
windows_iso_cache:w11-ltsc-2024:en-us
```

value：

```json
{
  "version": "w11-ltsc-2024",
  "lang": "zh-cn",
  "image_name": "Windows 11 Enterprise LTSC 2024",
  "iso_url": "https://software.download.prss.microsoft.com/...",
  "source": "massgrave",
  "resolved_at": "2026-05-31T00:00:00.000Z",
  "expires_at": "2026-05-31T06:00:00.000Z"
}
```

TTL：6 小时。

说明：Microsoft ISO URL 可能有短期签名或过期时间，不能永久写死。

## 7.4 失败策略

若解析失败：

- Telegram 显示：
  ```text
  暂时没找到可用的 Windows 11 官方 ISO，请稍后重试。
  ```
- 不要求用户输入 URL。
- 不创建实例。
- 写审计：`windows_iso.resolve failed`。

后续可加高级兜底：手动 ISO URL，但默认不显示。

---

## 8. WindowsInstanceService 扩展

当前已有能力：

- `getStatus(accountId)`
- `ensureStackScript(accountId)`
- `getCreateOptions(accountId)`
- `createWindowsInstance(accountId, input)`

需要扩展：

```ts
interface CreateWindowsInstanceInput {
  version: WindowsInstallVersion;
  lang?: WindowsLanguage;
  region: string;
  type: string;
  firewall_id?: number | null;
  label?: string;
}
```

处理逻辑：

```text
1. 校验 account active。
2. 校验 version。
3. 校验 language。
4. 校验 region 为 core region。
5. 校验 type 满足内存/磁盘要求。
6. ensureStackScript。
7. 若 version=w11-ltsc-2024：调用 WindowsIsoResolverService.resolve。
8. 生成 Administrator 密码。
9. 生成临时 Ubuntu root 密码。
10. 构造 stackscript_data。
11. 校验 stackscript_data <= 65535 字符。
12. Linode API 创建 instance。
13. 写审计。
14. 返回一次性密码。
```

## 8.1 stackscript_data

Server 2022：

```json
{
  "TOKEN": "<linode_token>",
  "WINDOWS_PASSWORD": "<random>",
  "INSTALL_WINDOWS_VERSION": "2k22",
  "WINDOWS_IMAGE_NAME": "Windows Server 2022 SERVERDATACENTER",
  "WINDOWS_LANG": "en-us",
  "AUTOLOGIN": "true",
  "W11_ISO_URL": "NOURL"
}
```

Win11：

```json
{
  "TOKEN": "<linode_token>",
  "WINDOWS_PASSWORD": "<random>",
  "INSTALL_WINDOWS_VERSION": "w11",
  "WINDOWS_IMAGE_NAME": "Windows 11 Enterprise LTSC 2024",
  "WINDOWS_LANG": "zh-cn",
  "AUTOLOGIN": "true",
  "W11_ISO_URL": "<auto_resolved_iso_url>"
}
```

## 8.2 payload 大小限制

官方限制：`stackscript_data` 总长度 <= 65,535 字符。

Service 加校验：

```ts
if (JSON.stringify(stackscriptData).length > 65535) {
  throw new AppError(ErrorCode.VALIDATION_ERROR, "StackScript data is too large", requestId, 400);
}
```

---

## 9. StackScript 模板设计

## 9.1 模板来源策略

- 主参考：`kitknox/winode` 最新版。
- 辅助参考：用户贴的社区 StackScript 片段。
- 不使用聊天里损坏的脚本文本。
- 不直接使用 Linode public Community StackScript。
- 最终作为本项目私有 StackScript 模板。

## 9.2 UDF 参数

```bash
#<UDF name="TOKEN" Label="Linode API Token" />
#<UDF name="WINDOWS_PASSWORD" Label="Administrator Password for Windows" />
#<UDF name="INSTALL_WINDOWS_VERSION" Label="Windows Version" oneOf="w11,2k22" default="2k22"/>
#<UDF name="WINDOWS_IMAGE_NAME" Label="Windows Image Name" />
#<UDF name="WINDOWS_LANG" Label="Windows Language" oneOf="zh-cn,en-us" default="en-us"/>
#<UDF name="AUTOLOGIN" Label="Auto Login to Windows" oneOf="true,false" default="true"/>
#<UDF name="W11_ISO_URL" Label="Windows 11 ISO URL" default="NOURL"/>
```

## 9.3 多阶段流程

```text
STAGE=1:
  - 安装依赖 jq/wimtools/genisoimage/libwin-hivex-perl
  - 创建临时 Block Storage Volume
  - 格式化并挂载临时卷
  - 创建 BLOCK config
  - rsync 当前系统到临时卷
  - 写入 rc.local 并改 STAGE=2
  - reboot 到 BLOCK config

STAGE=2:
  - 删除原 Ubuntu/Debian root disk
  - 删除 swap disk
  - 创建 raw Windows disk
  - 更新 BLOCK config 附加 raw disk
  - 改 STAGE=3
  - reboot

STAGE=3:
  - 创建 Windows config，kernel=linode/direct-disk
  - 下载 Windows ISO
  - 注入 VirtIO
  - 创建安装介质分区和 Windows 目标分区
  - 写 autounattend.xml
  - 清理临时卷 / 准备 direct-disk
  - reboot 到 Windows config
```

## 9.4 必须修复项

- 删除 `[B<?xml...`。
- `Windows 10 Pro` 改为 `$WINDOWS_IMAGE_NAME`。
- 所有 `REG_DWORD` 命令必须正确。
- `chmod +x /mnt/temp-$LINODE_ID/etc/rc.local` 路径正确。
- `LINODE_ID=$(...)` 写法正确。
- `LINODE_INSTANCE_TYPE=$(...)` 写法正确。
- token/password/url 做 shell escape。
- 避免 echo token/password。
- curl Linode API 增加错误检查。
- reboot Linode busy 增加 retry/backoff。
- volume 查询用 label + linode_id 过滤，避免误匹配。
- 临时 volume 清理要尽量做。

## 9.5 Win11 autounattend 核心修复

镜像名：

```xml
<MetaData wcm:action="add">
  <Key>/IMAGE/NAME</Key>
  <Value>$WINDOWS_IMAGE_NAME</Value>
</MetaData>
```

硬件限制绕过：

```cmd
reg add HKLM\System\Setup\LabConfig /v BypassTPMCheck /t REG_DWORD /d 0x00000001 /f
reg add HKLM\System\Setup\LabConfig /v BypassSecureBootCheck /t REG_DWORD /d 0x00000001 /f
reg add HKLM\System\Setup\LabConfig /v BypassRAMCheck /t REG_DWORD /d 0x00000001 /f
reg add HKLM\System\Setup\LabConfig /v BypassCPUCheck /t REG_DWORD /d 0x00000001 /f
reg add HKLM\System\Setup\LabConfig /v BypassStorageCheck /t REG_DWORD /d 0x00000001 /f
```

语言：

- `zh-cn` 映射 Windows locale 为 `zh-CN`。
- `en-us` 映射为 `en-US`。

---

## 10. Telegram 流程设计

## 10.1 入口

```text
🪟 创建 Windows 服务器
```

## 10.2 版本选择

```text
请选择 Windows 版本：

✅ Windows Server 2022 Evaluation
稳定路线，推荐生产前先测试。

🧪 Windows 11 Enterprise LTSC 2024
实验路线，Bot 会自动查找官方 ISO。
```

## 10.3 语言选择

仅 Win11：

```text
请选择 Windows 11 语言：

🇨🇳 简体中文
🇺🇸 English
```

## 10.4 自动 ISO 提示

```text
Bot 会自动查找官方 Windows 11 ISO。
不需要你手动输入 ISO 链接。
如果 Microsoft 临时链接失效，Bot 会自动重新解析；仍失败时请稍后重试。
```

## 10.5 确认页

```text
🪟 创建 Windows 11 服务器
━━━━━━━━━━━━
版本：Windows 11 Enterprise LTSC 2024
语言：简体中文
地区：...
配置：...
防火墙：...

⚠️ 确认后会创建收费 Linode。
⚠️ Windows 11 为非官方实验路线，成功率低于 Windows Server 2022。
⚠️ 安装约 20-40 分钟，中途多次重启属正常。
⚠️ 安装脚本会临时使用当前 Linode Token 调用 Linode API 配置磁盘/启动项。
🔐 Administrator 密码和临时 Ubuntu root 密码只显示一次，请立即保存。
```

## 10.6 创建成功页

```text
✅ Windows 创建请求已提交
━━━━━━━━━━━━
服务器：...
状态：provisioning
公网 IP：等待分配 / x.x.x.x
RDP：x.x.x.x:3389
用户名：Administrator

⚠️ 重要：下面两个密码不会再次显示，请立刻复制保存。

Administrator 密码：...
临时 Ubuntu root 密码：...

安装预计 20-40 分钟，中途多次重启属正常。
保存密码后，可从服务器详情查看状态。
```

按钮：

```text
🖥 打开服务器详情
↩️ 返回账号服务器
```

不使用“刷新状态”刷屏按钮。

---

## 11. 安全设计

## 11.1 密码

- 随机生成 Administrator 密码。
- 随机生成临时 Ubuntu root 密码。
- 只显示一次。
- 不写入 D1。
- 不写审计。
- 不写日志。
- 成功页强提醒用户保存。

## 11.2 Token

StackScript 需要 Linode Token，因为要调用：

- volumes create/query/delete
- disks list/delete/create
- configs list/create/update
- reboot with config

安全要求：

- Telegram 确认页明确说明。
- StackScript 不 echo token。
- 审计不记录 token。
- 后续评估短期安装 token。

## 11.3 ISO URL

ISO URL 可能含临时签名参数。

- 不在审计中记录完整 URL。
- 可记录：`source=massgrave`、`cache_hit=true/false`。
- D1 cache 可存 URL，但设置 TTL。

## 11.4 高危审计

审计事件：

```text
windows_iso.resolve
windows_stackscript.create/update
windows_instance.create
```

风险等级：

- ISO resolve：low/medium
- StackScript create/update：high
- Windows instance create：critical

---

## 12. 测试计划

## 12.1 ISO Resolver 测试

- cache hit。
- cache miss 后解析。
- zh-cn 匹配。
- en-us 匹配。
- 解析失败返回明确错误。
- URL 域名白名单校验。
- TTL 过期后刷新。

## 12.2 Service 测试

- `version=2k22` 不解析 ISO。
- `version=w11-ltsc-2024` 自动解析 ISO。
- payload 包含：
  - `INSTALL_WINDOWS_VERSION=w11`
  - `WINDOWS_IMAGE_NAME=Windows 11 Enterprise LTSC 2024`
  - `WINDOWS_LANG=zh-cn`
  - `W11_ISO_URL=<resolved>`
- 密码不落库。
- 审计不泄露 token/password/ISO URL。
- `stackscript_data` 长度校验。
- region 必须 core。
- type 满足最低配置。

## 12.3 Telegram 测试

- 显示版本选择。
- 选择 Win11 后显示语言选择。
- 语言后进入 Region。
- Region → Plan → Firewall → Confirm 正常。
- 确认页包含自动 ISO 和实验提示。
- 创建成功页包含一次性密码提醒。
- 不出现 ISO URL 输入。

## 12.4 StackScript 静态检查

- 无 `[B<?xml`。
- 无 `Windows 10 Pro` 写死。
- `REG_DWORD` 正确。
- 无公开默认密码。
- 不 echo token。
- 不 echo password。

## 12.5 构建验证

每轮：

```bash
npm run typecheck
npm test
npm run build:upload
```

## 12.6 实机验证

至少一台测试 Linode：

- Region：core region。
- Plan：推荐 8GB 内存。
- Firewall：测试期可不绑定，或开放 3389。
- 等待 20-40 分钟。
- 检查 RDP。
- 检查 LISH。
- 记录失败原因。

---

## 13. 实施阶段

### Phase 1：文档

- 更新 `docs/WINDOWS_11_TECHNICAL_PLAN.md`。
- 加致谢。
- 记录参考项目策略。

### Phase 2：ISO Resolver

- 新增 `WindowsIsoResolverService`。
- 支持 Win11 LTSC 2024 zh-cn/en-us。
- D1 cache。

### Phase 3：Service/API

- 增加 Windows versions API。
- `WindowsInstanceService` 支持 version/lang。
- create-options 支持 version/lang。
- create instance 支持 Win11 payload。

### Phase 4：StackScript 模板

- 以 winode 最新版结构重构。
- 修 Win11 XML。
- 参数化 image/lang。
- 保留 2k22 稳定路线。

### Phase 5：Telegram UI

- 版本选择。
- 语言选择。
- 自动 ISO 提示。
- Win11 确认页。

### Phase 6：实机验证

- 创建真实 Win11 测试机。
- 修复 StackScript 兼容问题。
- 成功后再把 Win11 从“实验”调整为“可用/推荐测试”。

---

## 14. 文档致谢

建议加入 README / docs：

```md
## Acknowledgements

Windows reinstall / DD / netboot / ISO resolution ideas were reviewed with reference to:

- kitknox/winode: https://github.com/kitknox/winode
- bin456789/reinstall: https://github.com/bin456789/reinstall
- leitbogioro/Tools: https://github.com/leitbogioro/Tools

Thanks to the authors for their excellent work.

Linode Guard Lite does not directly execute these scripts by default. Windows creation uses a controlled API-first private StackScript flow with random one-time passwords, high-risk confirmation, and audit logs.
```

中文：

```md
## 致谢

Windows 重装 / DD / netboot / ISO 自动解析相关思路参考了以下优秀项目：

- kitknox/winode: https://github.com/kitknox/winode
- bin456789/reinstall: https://github.com/bin456789/reinstall
- leitbogioro/Tools: https://github.com/leitbogioro/Tools

感谢各位大佬的开源脚本和经验积累。

说明：Linode Guard Lite 默认不会直接执行这些脚本；当前 Windows 创建使用受控的 API-first 私有 StackScript 流程，并保持随机密码、一次性展示、高危确认和审计日志。
```

---

## 15. 最终建议

推荐实现路线：

```text
主架构：kitknox/winode / Linode Community StackScript
ISO 自动解析：bin456789/reinstall 思路
DD/InstallNET 经验：leitbogioro/Tools 辅助参考
交互：Telegram 只做窗口
核心：WindowsInstanceService + WindowsIsoResolverService
```

MVP 做：

- Windows 11 Enterprise LTSC 2024。
- zh-cn / en-us。
- 自动 ISO。
- 私有 StackScript。
- 随机密码，只显示一次。
- 高危确认。
- 审计日志。

不做：

- 用户输入 ISO。
- 自动 SSH 执行第三方脚本。
- 直接复制 GPL 脚本代码。
- public Community StackScript 直连。
- Windows 11 ARM。

这条路线最符合豪叔的目标：

```text
用户在 TG 里点几下，就能创建 Linode Win11 服务器。
```


---

## 16. 后续备选路线：已有 VPS 重装 Win11（暂不开发）

定位：后续高级功能 / Advanced Mode。  
状态：写入方案，当前暂不开发。  
目标：针对已经存在的 Linode VPS，提供 Windows 11 重装能力，而不是创建全新实例。

这条路线不影响当前主线：

```text
当前主线：新建 Linode → 私有 StackScript → 自动安装 Win11
后续备选：已有 VPS → 用户确认 → 生成/执行重装命令 → 安装 Win11
```

### 16.1 参考项目

必须在文档和致谢中写入以下项目地址：

- kitknox/winode：
  - https://github.com/kitknox/winode
  - 用途：Linode 专用 Windows StackScript 主架构参考。

- bin456789/reinstall：
  - https://github.com/bin456789/reinstall
  - 用途：已有 VPS 重装 Windows / ISO 自动查找 / Windows 安装体验参考。

- leitbogioro/Tools：
  - https://github.com/leitbogioro/Tools
  - 用途：InstallNET / DD / 多云重装经验参考。

### 16.2 为什么保留这条备选路线

`bin456789/reinstall` 很强，虽然它更适合：

```text
已有 VPS
→ SSH 进去
→ 执行重装脚本
```

但这并不是不能用。只要后续设计好权限、确认、日志和失败恢复，它可以作为“已有服务器重装 Win11”的高级功能。

用户目标可能有两类：

1. 创建一台新的 Linode Win11。
2. 把已有 Linode 重装成 Win11。

当前 MVP 优先做第 1 类；第 2 类作为后续备选。

### 16.3 备选实现方式 A：生成命令，用户自己 SSH 执行

Bot 不保存 SSH 密码、不自动 SSH，只生成命令和风险提示。

示例命令：

```bash
curl -O https://raw.githubusercontent.com/bin456789/reinstall/main/reinstall.sh
bash reinstall.sh windows \
  --image-name "Windows 11 Enterprise LTSC 2024" \
  --lang zh-cn
```

可选参数后续可支持：

```bash
--password '<随机生成密码>'
--rdp-port 3389
--allow-ping
```

优点：

- 实现简单。
- Worker 不需要 SSH。
- 不保存用户 SSH 凭据。
- 用户明确知道自己在执行高危重装。
- 风险和责任边界清楚。

缺点：

- 用户需要自己 SSH 到 VPS。
- 不是完全一键。

### 16.4 备选实现方式 B：未来接入受控 Runner / Agent 自动执行

未来如果 Linode Guard Lite 有受控 runner 或节点执行器，可做：

```text
Telegram
→ API
→ Runner/Agent
→ SSH 到目标 VPS
→ 执行 bin456789/reinstall
→ 回传日志/状态
```

优点：

- 用户体验最好。
- 可做到真正一键重装已有 VPS。

风险和要求：

- 需要 SSH 凭据或短期 SSH key。
- 需要任务队列。
- 需要日志脱敏。
- 需要超时控制。
- 需要失败恢复方案。
- 需要明确高危确认。
- 需要审计。
- 需要避免保存 SSH 密码。

这条路线风险高，不进入 Win11 MVP。

### 16.5 安全要求

如果后续开发已有 VPS 重装功能，必须满足：

- 默认不启用。
- 标记为高级/危险功能。
- 明确提示会清空磁盘。
- 必须二次确认。
- 不保存 SSH 密码。
- 如需自动 SSH，优先使用一次性临时 SSH key。
- 日志过滤 password/token/key。
- 审计记录：谁、何时、对哪台实例、生成/执行了什么路线。
- 不默认执行 kejilion 大菜单。
- 优先使用 bin456789/reinstall 官方 raw 地址。
- 文档明确感谢 bin456789/reinstall。

### 16.6 暂不开发原因

当前用户核心目标是：

```text
通过 Telegram Bot 创建新的 Linode Win11 服务器。
```

而已有 VPS 重装涉及 SSH、凭据、任务执行、失败恢复和更高破坏风险。为了尽快实现主目标，先将该路线写入方案，后续单独开发。



## 实现状态更新（2026-05-31）

已按 API-first / Service-first 路线实现版本模型、Windows 11 ISO 自动解析、Service/API 扩展、Telegram 版本/语言流程和 StackScript 模板基础修复。已有 VPS 使用 bin456789/reinstall 重装 Win11 仍只作为后续备选路线，本轮不开发。

致谢链接保留：

- kitknox/winode: https://github.com/kitknox/winode
- bin456789/reinstall: https://github.com/bin456789/reinstall
- leitbogioro/Tools: https://github.com/leitbogioro/Tools
