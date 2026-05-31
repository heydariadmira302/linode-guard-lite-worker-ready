# Linode Guard Lite - Windows 11 实施方案与文件改动清单

状态：实施前方案，尚未开发  
目标：在 Linode Guard Lite 中实现通过 Telegram 创建 Linode Windows 11 服务器。  
约束：API-first / Service-first；Telegram 只是展示窗口；改动前需先确认方案；开发完成前不擅自推 GitHub。

---

## 1. 实施总路线

主线：

```text
Telegram 选择 Windows 11
→ WindowsInstanceService 校验和创建
→ WindowsIsoResolverService 自动解析官方 ISO
→ Linode API 创建 Ubuntu 22.04 + 私有 StackScript 实例
→ StackScript 安装 Windows 11
```

参考来源：

- kitknox/winode: https://github.com/kitknox/winode
  - 主参考：Linode 专用 StackScript 架构。
- bin456789/reinstall: https://github.com/bin456789/reinstall
  - 主参考：Windows ISO 自动解析和 `image-name + lang` 体验。
- leitbogioro/Tools: https://github.com/leitbogioro/Tools
  - 辅助参考：InstallNET / DD / 多云重装经验。

本轮不开发：

- 已有 VPS 重装 Win11。
- SSH/Runner 自动执行 bin456789/reinstall。
- Windows 11 ARM。
- Web 后台。
- 手动 ISO URL 默认入口。

---

## 2. 开发阶段拆分

## Phase 0：接手与基线检查

目的：确认当前项目状态，避免在旧状态上改错。

动作：

1. 阅读：
   - `README.md`
   - `docs/WINDOWS_11_TECHNICAL_PLAN.md`
   - `docs/WINDOWS_11_IMPLEMENTATION_PLAN.md`
   - `docs/SESSION_NOTES.md`
   - `docs/PRODUCT_NEXT.md`
   - `docs/api.md`
   - `docs/telegram.md`
2. 检查 Git 状态：
   - `git status --short --branch`
   - `git log --oneline --decorate --max-count=8`
3. 跑基线：
   - `npm run typecheck`
   - `npm test`
   - `npm run build:upload`

交付：

- 如果基线失败，先报告，不继续开发。
- 如果基线通过，进入 Phase 1。

---

## Phase 1：Windows 版本模型与 API 基础

目的：让系统知道有哪些 Windows 版本可选，先不触碰 StackScript。

新增/修改文件：

### 新增

- `src/services/windows-version-service.ts`

内容：

- 定义 `WindowsInstallVersion`：
  - `2k22`
  - `w11-ltsc-2024`
- 定义 `WindowsLanguage`：
  - `zh-cn`
  - `en-us`
- 定义版本元数据：
  - label
  - stackscript version
  - image name
  - min memory/disk
  - stability
  - estimated minutes
  - supported languages

### 修改

- `src/api/windows-instances.ts`
  - 新增 handler：`handleListWindowsVersions`

- `src/router.ts`
  - 新增路由：
    - `GET /api/v1/windows/versions`

- `docs/api.md`
  - 记录 Windows versions API。

### 测试

- `tests/phase6-instances.test.ts`
  - 添加 API 返回版本列表测试。

验收：

- `GET /api/v1/windows/versions` 返回 2k22 和 w11-ltsc-2024。
- 不影响现有 Windows Server 2022 创建。

---

## Phase 2：WindowsIsoResolverService

目的：实现自动解析 Win11 官方 ISO，用户不输入 ISO URL。

新增文件：

- `src/services/windows-iso-resolver-service.ts`

职责：

- 根据 `version=w11-ltsc-2024` + `lang` 自动解析 ISO URL。
- 优先读取 D1 settings cache。
- cache 未命中或过期时访问 ISO 索引页面。
- 只接受 HTTPS URL。
- 优先接受 Microsoft 官方下载域名：
  - `software.download.prss.microsoft.com`
  - `download.microsoft.com`
- 缓存成功结果 6 小时。

可能涉及：

- `src/storage/settings-repository.ts`
  - 如果现有 get/set 足够，不改。
  - 若需要 TTL helper，可加轻量封装，但不改 schema。

Resolver 输入：

```ts
{
  version: "w11-ltsc-2024",
  lang: "zh-cn" | "en-us",
  requestId: string,
  forceRefresh?: boolean
}
```

Resolver 输出：

```ts
{
  version: "w11-ltsc-2024",
  lang: "zh-cn",
  image_name: "Windows 11 Enterprise LTSC 2024",
  iso_url: "https://...",
  source: "cache" | "massgrave",
  resolved_at: "...",
  expires_at: "..."
}
```

测试：

- 可新增：`tests/phase22-windows-iso-resolver.test.ts`
- 或并入：`tests/phase6-instances.test.ts`

测试点：

- cache hit。
- cache miss 后 fetch 并解析。
- zh-cn / en-us 匹配。
- 解析失败返回明确错误。
- 非 HTTPS URL 拒绝。
- 非白名单域名拒绝或降级拒绝。
- 不把 ISO URL 写进审计。

验收：

- 无需用户输入 ISO URL。
- Resolver 能 mock 解析出 ISO URL。

---

## Phase 3：WindowsInstanceService 扩展

目的：让 Windows 创建支持 version/lang，并在 Win11 时自动解析 ISO。

修改文件：

- `src/services/windows-instance-service.ts`

改动：

1. `CreateWindowsInstanceInput` 增加：
   - `version?: WindowsInstallVersion`
   - `lang?: WindowsLanguage`

2. `getCreateOptions(accountId, requestId)` 扩展为：
   - 支持 version/lang 参数。
   - 返回 selected_version / selected_language。
   - Windows 11 时可返回 `iso_resolve_required=true`。

3. `createWindowsInstance(...)`：
   - 默认为 `2k22`，保持兼容。
   - 如果 `version=w11-ltsc-2024`：
     - 调用 `WindowsIsoResolverService.resolve(...)`。
     - `INSTALL_WINDOWS_VERSION` 传 `w11`。
     - `WINDOWS_IMAGE_NAME` 传 `Windows 11 Enterprise LTSC 2024`。
     - `WINDOWS_LANG` 传 `zh-cn` 或 `en-us`。
     - `W11_ISO_URL` 传 resolver 得到的 URL。
   - 校验 `stackscript_data` JSON 长度 <= 65535。
   - 校验 type 满足内存/磁盘要求。
   - 继续不保存密码到 D1。
   - 审计 metadata 不记录 token/password/完整 ISO URL。

4. Region 校验：
   - Windows 创建只允许 core region。
   - 如果用户传 distributed region，返回明确错误。

相关文件：

- `src/clients/linode-client.ts`
  - 若 type/region 字段已有足够信息，不改。
  - 若缺 `site_type` / disk/memory 字段，则补类型定义。

测试：

- `tests/phase6-instances.test.ts`
  - Server 2022 原测试继续通过。
  - Win11 payload 包含：
    - `INSTALL_WINDOWS_VERSION=w11`
    - `WINDOWS_IMAGE_NAME=Windows 11 Enterprise LTSC 2024`
    - `WINDOWS_LANG=zh-cn`
    - `W11_ISO_URL=<mocked>`
  - 密码不落库。
  - token/password 不出现在审计 metadata。
  - type 不满足内存/磁盘时报错。
  - region 非 core 时报错。

验收：

- API 可创建 Win11 payload。
- 不破坏现有 2k22。

---

## Phase 4：API 扩展

目的：把 Service 能力暴露为 API。

修改文件：

- `src/api/windows-instances.ts`
- `src/router.ts`
- `docs/api.md`

改动：

1. `GET /api/v1/accounts/:account_id/windows/create-options`
   - 支持 query：
     - `version`
     - `lang`

2. `POST /api/v1/accounts/:account_id/windows/instances`
   - 支持 body：

```json
{
  "version": "w11-ltsc-2024",
  "lang": "zh-cn",
  "region": "jp-osa",
  "type": "g6-dedicated-4",
  "firewall_id": null
}
```

3. 响应增加：
   - `windows_version`
   - `windows_version_label`
   - `windows_language`
   - `estimated_minutes`

测试：

- API create-options query 测试。
- API create Win11 测试。

验收：

- API 层不写业务逻辑，只解析参数并调用 Service。

---

## Phase 5：StackScript 模板升级

目的：让私有 StackScript 支持 Win11 自动安装。

修改文件：

- `src/services/windows-stackscript-template.ts`

主参考：

- `kitknox/winode` 最新版 `install-windows.sh`。

注意：

- 不使用聊天里复制损坏的脚本。
- 不直接使用 public Community StackScript。
- 最终模板需要适配项目变量和安全要求。

必须实现：

1. UDF 支持：
   - `TOKEN`
   - `WINDOWS_PASSWORD`
   - `INSTALL_WINDOWS_VERSION`：`2k22` / `w11`
   - `WINDOWS_IMAGE_NAME`
   - `WINDOWS_LANG`
   - `AUTOLOGIN`
   - `W11_ISO_URL`

2. Win11 修复：
   - 删除 `[B<?xml` 脏字符。
   - 不写死 `Windows 10 Pro`。
   - 使用 `$WINDOWS_IMAGE_NAME`。
   - `REG_DWORD` 命令正确。
   - locale 根据 `WINDOWS_LANG` 转换：
     - `zh-cn` → `zh-CN`
     - `en-us` → `en-US`

3. 安全：
   - 不 echo token。
   - 不 echo password。
   - 不把完整 ISO URL 打到日志里，最多显示已开始下载。

4. 稳定性：
   - 保留/增加 Linode busy retry。
   - volume 查询尽量按 label + linode_id。
   - 临时 volume 清理尽量完善。
   - direct-disk config 正确。

测试：

- 静态字符串检查：
  - 不含 `[B<?xml`。
  - 不含 `Windows 10 Pro` 写死。
  - 包含 `WINDOWS_IMAGE_NAME`。
  - 包含 `BypassTPMCheck` 等 Win11 绕过。
  - 不含公开默认密码。

验收：

- `npm run build:upload` 能打包。
- StackScript 模板体积可接受。

---

## Phase 6：Telegram 流程扩展

目的：让用户在 TG 里无感创建 Win11。

修改文件：

- `src/telegram/callbacks.ts`
- `src/telegram/instance-renderer.ts`
- 可能新增：
  - `src/telegram/windows-renderer.ts`（推荐，避免 instance-renderer 太大）

改动：

1. Windows 创建入口后先选版本：
   - Server 2022 稳定。
   - Windows 11 LTSC 2024 实验。

2. 选择 Win11 后选语言：
   - 简体中文。
   - English。

3. 选完语言后进入已有 Region → Plan → Firewall。

4. 确认页根据版本显示不同文案：
   - Server 2022：15-30 分钟。
   - Win11：20-40 分钟，实验路线，自动 ISO。

5. 成功页：
   - 显示版本 / 语言。
   - 强提醒密码只显示一次。
   - 不放“刷新状态”刷屏按钮。
   - 不放无意义复制按钮。

Bot session data：

```json
{
  "account_id": 1,
  "version": "w11-ltsc-2024",
  "lang": "zh-cn",
  "state": {
    "region": "jp-osa",
    "type": "g6-dedicated-4",
    "firewall_id": null
  },
  "options": {}
}
```

测试：

- 点击 Windows 创建显示版本选择。
- 选 Win11 显示语言选择。
- 选语言进入 Region。
- Plan 后进入 Firewall。
- Confirm 页包含自动 ISO 提示。
- 成功页包含版本/语言/密码保存提醒。

验收：

- Telegram 层只调用 Service，不拼业务逻辑。

---

## Phase 7：文档与致谢

修改文件：

- `README.md`
- `docs/api.md`
- `docs/telegram.md`
- `docs/security.md`
- `docs/PRODUCT_NEXT.md`
- `docs/SESSION_NOTES.md`
- `docs/WINDOWS_11_TECHNICAL_PLAN.md`

内容：

- 新增 Win11 使用说明。
- 新增 API 文档。
- 新增 Telegram 流程。
- 新增安全说明。
- 新增项目致谢。

致谢必须包含：

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

## Phase 8：整体验证

必须跑：

```bash
npm run typecheck
npm test
npm run build:upload
```

额外检查：

```bash
# 敏感信息检查
rg "github_pat_|ghp_|TELEGRAM_BOT_TOKEN|LINODE_TOKEN|API_AUTH_TOKEN|TELEGRAM_WEBHOOK_SECRET|LINODE_TOKEN_ENCRYPTION_KEY|<KNOWN_PUBLIC_DEFAULT_PASSWORD_PATTERNS>"
```

注意：

- 文档里可以出现公开项目 URL。
- 不要出现真实 token/password/chat_id/IP/个人域名。

---

## Phase 9：实机验证计划

开发合并后，先不大规模使用。

测试步骤：

1. Cloudflare 部署成功。
2. Telegram 进入「创建 Windows 服务器」。
3. 选择 Windows 11 LTSC 2024。
4. 选择 zh-cn。
5. 选择 core region。
6. 选择 8GB 推荐配置或至少 4GB/80GB。
7. 不绑定 firewall 或绑定开放 3389 的 firewall。
8. 确认创建。
9. 立即保存密码。
10. 等 20-40 分钟。
11. 用 RDP 连接。
12. 如果失败，通过 Linode LISH / 控制台看日志。

记录：

- Region。
- Plan。
- 安装耗时。
- 是否成功 RDP。
- 是否需要手动 reboot。
- StackScript 日志错误。

---

## 后续备选路线：已有 VPS 重装 Win11（暂不开发）

本路线写入方案，但本轮不开发。

参考：

- bin456789/reinstall: https://github.com/bin456789/reinstall

方式 A：Bot 生成命令，用户自己 SSH 执行。

```bash
curl -O https://raw.githubusercontent.com/bin456789/reinstall/main/reinstall.sh
bash reinstall.sh windows \
  --image-name "Windows 11 Enterprise LTSC 2024" \
  --lang zh-cn
```

方式 B：未来 Runner/Agent 自动 SSH 执行。

暂不开发原因：

- 涉及 SSH 凭据。
- 风险高。
- 需要任务队列、日志、超时、失败恢复。
- 当前主目标是创建新 Linode Win11。

---

## 文件改动清单总览

### 新增文件

- `src/services/windows-version-service.ts`
- `src/services/windows-iso-resolver-service.ts`
- `tests/phase22-windows-iso-resolver.test.ts`（可选，推荐）
- `src/telegram/windows-renderer.ts`（可选，推荐）
- `docs/WINDOWS_11_IMPLEMENTATION_PLAN.md`

### 修改文件

- `src/services/windows-instance-service.ts`
- `src/services/windows-stackscript-template.ts`
- `src/api/windows-instances.ts`
- `src/router.ts`
- `src/clients/linode-client.ts`（如需补类型）
- `src/telegram/callbacks.ts`
- `src/telegram/instance-renderer.ts`（或迁移部分到 `windows-renderer.ts`）
- `tests/phase6-instances.test.ts`
- `README.md`
- `docs/api.md`
- `docs/telegram.md`
- `docs/security.md`
- `docs/PRODUCT_NEXT.md`
- `docs/SESSION_NOTES.md`
- `docs/WINDOWS_11_TECHNICAL_PLAN.md`

### 不应修改

- 不改通知逻辑。
- 不加部署通知手动触发接口。
- 不改 GitHub remote。
- 不写真实 token/password 到文件。
- 不把用户私密信息写进文档。

---

## 最终验收标准

功能验收：

- Telegram 可以选择 Windows 11。
- Telegram 可以选择 zh-cn/en-us。
- 用户无需输入 ISO URL。
- Service 自动解析 ISO。
- API 创建 payload 正确。
- StackScript 支持 Win11。
- 密码只显示一次，不落库。
- 确认页高危提示完整。
- 不破坏 Server 2022。

工程验收：

- `npm run typecheck` 通过。
- `npm test` 通过。
- `npm run build:upload` 通过。
- 无敏感信息泄露。
- 文档更新完整。

实机验收：

- 至少一台 Linode Win11 创建成功。
- RDP 可连接。
- 密码正确。
- 安装失败时有可读日志和明确提示。



## 实现状态更新（2026-05-31）

已按 API-first / Service-first 路线实现版本模型、Windows 11 ISO 自动解析、Service/API 扩展、Telegram 版本/语言流程和 StackScript 模板基础修复。已有 VPS 使用 bin456789/reinstall 重装 Win11 仍只作为后续备选路线，本轮不开发。

致谢链接保留：

- kitknox/winode: https://github.com/kitknox/winode
- bin456789/reinstall: https://github.com/bin456789/reinstall
- leitbogioro/Tools: https://github.com/leitbogioro/Tools
