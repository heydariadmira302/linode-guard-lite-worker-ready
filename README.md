# Linode Guard Lite

Linode Guard Lite 是一个 **API-first** 的自托管 Linode / Akamai Cloud 轻量运维控制面，运行在 **Cloudflare Workers** 上，使用 Cloudflare D1 存储。Telegram 只是默认前端入口之一，核心能力都通过标准 HTTP API 暴露。

## 已支持能力

- Linode 账号与 Token 加密管理
- 账号分组
- 实例列表 / 详情 / 开机 / 关机 / 重启 / 删除
- 批量开机 / 关机 / 删除（全部账号 / 单账号 / 分组）
- 账号安全事件监控：IP Geo / ASN、IP 白名单、国家 / 地区策略、夜间登录、Token 错误去重
- 管理员保活确认与保活策略
- 定时开机 / 关机 / 重启
- 定时任务范围：全部账号 / 单账号 / 分组 / 单台服务器
- Boot safety：默认只开机上次由 Bot 关停的实例，避免误开用户手动关机的机器
- 系统自检 / 诊断中心：检查部署、Jobs 和 Boot safety 状态
- Cloudflare Cron Job Runner
- 审计日志
- Setup Wizard 与部署自检

## Install from GitHub

```bash
gh auth login
git clone https://github.com/<YOUR_GITHUB_REPO>.git
cd linode-guard-lite-worker-ready
npm install
npm run typecheck
npm test
npm run build:upload
```

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build:upload
npm run dev
```

Health check:

```bash
curl http://localhost:8787/api/v1/health
```

## 上线前检查

```bash
npm run typecheck
npm test
npm run build:upload
```

必须确认：

- Worker 后台已绑定 D1，变量名为 `DB`
- 新部署只执行 `schema.sql` 或 `migrations/0001_initial.sql`，不要盲跑 `migrations/0002_legacy_group_compat.sql`、`0003_power_schedules_group_scope.sql`、`0004_power_schedules_instance_scope.sql`、`0005_job_locks.sql`
- 旧 D1 升级前必须先做 schema inspect，确认缺列后才执行对应 legacy migration
- 已设置最小 Worker Secret：`TELEGRAM_BOT_TOKEN`
- 已通过 `/setup` 初始化自动生成 runtime secrets，或已手动设置 `API_AUTH_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `LINODE_TOKEN_ENCRYPTION_KEY`
- `/api/v1/setup/initialize` 默认不向普通响应返回 runtime secrets 明文；即使显式 reveal，也只允许首次返回 `API_AUTH_TOKEN`，不返回 webhook secret 或 Linode token encryption key
- Telegram Webhook 已设置并带 secret token
- `[triggers] crons = ["* * * * *"]` 已配置；Job Runner 会用 `jobs.next_run_at` 控制各任务实际频率
- `/api/v1/diagnostics/deployment` 返回关键检查通过
- `/api/v1/diagnostics/jobs` 默认 jobs 存在并启用

- 定时任务的 `cron_expr` 会按任务 `timezone` 解释；默认 `APP_TIMEZONE=Asia/Shanghai`，例如 `0 22 * * *` 表示上海时间 22:00。
- 安全设置中的自动生成 Linode Token 会调用 Linode `POST /profile/tokens`；本地测试必须 mock，不要用真实账号验证。

## Secrets

最小必填 Worker Secret：

- `TELEGRAM_BOT_TOKEN`

首次执行 `/setup initialize` 后，系统会自动生成并保存独立 runtime secrets 到 D1：

- `API_AUTH_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `LINODE_TOKEN_ENCRYPTION_KEY`

也可以选择手动设置这些 Worker Secrets；环境 Secret 优先级高于 D1 自动生成值。不要把这些值写入 README、docs、日志、Telegram 消息、`.env`、`.dev.vars` 或截图。

`SUPER_ADMIN_TELEGRAM_ID` 可选：不设置时，首次 Telegram 消息会自动绑定 Super Admin。

## D1

新部署：Apply `schema.sql` or `migrations/0001_initial.sql` to a D1 database bound as `DB`.

旧部署：先检查表和列，再按缺失情况选择 legacy migration。`ALTER TABLE ADD COLUMN` 在 D1/SQLite 中不能重复执行。若 `jobs.locked_until` / `locked_by` / `lock_started_at` 不存在，才执行 `migrations/0005_job_locks.sql`。

## Windows 创建

Telegram 入口「🪟 创建 Windows 服务器」已采用 API-first / Service-first 路线：Telegram 只负责选择账号、版本、语言、Region、Plan、Firewall 与高危确认，核心创建由 `WindowsInstanceService` 调用 Linode API + 私有 StackScript 完成。

当前版本：

- Windows Server 2022 Evaluation：稳定路线。
- Windows Server 2025：新增实验路线，支持简体中文 `zh-cn` 与 English `en-us`，使用 Microsoft 官方 Evaluation ISO。
- Windows Server 2025 / Windows 11 简体中文 DD 快速安装：实验路线，默认参考 `https://dl.lamp.sh/vhd/` 内置镜像源，无需额外配置。
- Windows 11 Enterprise LTSC 2024：实验路线，Bot 自动解析官方 ISO，用户不需要输入 ISO URL；支持 `zh-cn` / `en-us`。

参考与致谢：kitknox/winode <https://github.com/kitknox/winode>、bin456789/reinstall <https://github.com/bin456789/reinstall>、leitbogioro/Tools <https://github.com/leitbogioro/Tools>。

## 文档

- `QUICK_DEPLOY.md`
- `docs/local-dev.md`
- `docs/deployment/cloudflare.md`
- `docs/deployment/cloudflare-zip-worker.md`
- `docs/deployment/zip-upload.md`
- `docs/api.md`
- `docs/telegram.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `docs/PRODUCT_NEXT.md`
- `docs/SESSION_NOTES.md`

## Windows 安装完成通知

创建 Windows 服务器时，系统会生成一次性安装完成回调 token，只保存 hash 到 D1。Windows 首次登录阶段启用 RDP 后会回调 `/api/v1/windows/install-callback`，Bot 会主动通知管理员“Windows 安装完成，可以尝试远程桌面登录”。通知不会重复发送 Administrator 密码。若未配置 `PUBLIC_BASE_URL`，回调 URL 为空，安装仍继续，但不会主动通知。

## 风险说明

本项目会执行真实 Linode API 操作。删除、批量删除、单实例删除、保活策略触发删除都可能造成不可恢复的数据丢失。定时任务的单台服务器范围必须确认 `account_id + instance_id` 归属正确；批量删除和保活自动删机建议上线前配合 protected instance / 高危确认 / 防重复点击机制。批量/定时开机默认启用 Boot safety，仅开机上次由 Bot 关停的实例；如改为 `all_offline`，需确认不会误开手动关停的机器。上线前请使用最小权限 Token，并先在测试账号验证。
