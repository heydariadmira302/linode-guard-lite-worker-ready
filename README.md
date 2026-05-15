# Linode Guard Lite

Linode Guard Lite 是一个 **API-first** 的自托管 Linode / Akamai Cloud 轻量运维控制面，运行在 **Cloudflare Workers** 上，使用 Cloudflare D1 存储。Telegram 只是默认前端入口之一，核心能力都通过标准 HTTP API 暴露。

## 已支持能力

- Linode 账号与 Token 加密管理
- 实例列表 / 详情 / 开机 / 关机 / 重启 / 删除
- 批量开机 / 关机 / 删除
- 账号安全事件监控 MVP
- 管理员保活确认
- 定时开关机
- Cloudflare Cron Job Runner
- 审计日志
- Setup Wizard 与部署自检

## Install from GitHub

```bash
gh auth login
git clone https://github.com/cloudflare521/linode-guard-lite.git
cd linode-guard-lite
npm install
npm run typecheck
npm test
```

## Local development

```bash
npm install
npm run typecheck
npm test
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
```

必须确认：

- Worker 后台已绑定 D1，变量名为 `DB`
- 已执行 `schema.sql` / `migrations/0001_initial.sql`，或已通过 `/setup` 页面初始化
- 已设置最小 Worker Secret：`TELEGRAM_BOT_TOKEN`
- 已通过 `/setup` 初始化自动生成 runtime secrets，或已手动设置 `API_AUTH_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `LINODE_TOKEN_ENCRYPTION_KEY`
- Telegram Webhook 已设置并带 secret token
- `[triggers] crons = ["*/5 * * * *"]` 已配置
- `/api/v1/diagnostics/deployment` 返回关键检查通过
- `/api/v1/diagnostics/jobs` 默认 jobs 存在并启用

## Secrets

最小必填 Worker Secret：

- `TELEGRAM_BOT_TOKEN`

首次执行 `/setup initialize` 后，系统会自动生成并保存独立 runtime secrets 到 D1：

- `API_AUTH_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `LINODE_TOKEN_ENCRYPTION_KEY`

也可以选择手动设置这些 Worker Secrets；环境 Secret 优先级高于 D1 自动生成值。

`SUPER_ADMIN_TELEGRAM_ID` 可选：不设置时，首次 Telegram 消息会自动绑定 Super Admin。

## D1

Apply `schema.sql` or `migrations/0001_initial.sql` to a D1 database bound as `DB`.

## 文档

- `docs/deployment/cloudflare.md`
- `docs/deployment/zip-upload.md`
- `docs/api.md`
- `docs/telegram.md`
- `docs/security.md`
- `docs/troubleshooting.md`

## 风险说明

本项目会执行真实 Linode API 操作。删除、批量删除、保活策略触发删除都可能造成不可恢复的数据丢失。上线前请使用最小权限 Token，并先在测试账号验证。
