# Local Development / 本地测试

本项目可以先在本地用 Wrangler + 本地 D1 跑通，再考虑推 GitHub 和部署 Cloudflare Worker。本地测试也要避免泄露 secret，不要把 `.dev.vars`、`.env`、真实 Bot Token、Linode Token 或 Cloudflare API Token 提交到仓库。

## 1. 安装依赖

```bash
npm install
```

## 2. 准备本地环境变量

复制模板：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```bash
TELEGRAM_BOT_TOKEN="你的测试 Telegram Bot Token"
API_AUTH_TOKEN="<YOUR_API_AUTH_TOKEN>"
TELEGRAM_WEBHOOK_SECRET="<YOUR_TELEGRAM_WEBHOOK_SECRET>"
LINODE_TOKEN_ENCRYPTION_KEY="<YOUR_LINODE_TOKEN_ENCRYPTION_KEY>"
# SUPER_ADMIN_TELEGRAM_IDS="你的 Telegram 数字 ID，可选，多个用逗号分隔"
```

注意：

- `.dev.vars` 已在 `.gitignore`，不要提交真实密钥。
- 不要把 `.dev.vars` / `.env` 内容复制到聊天、文档或 issue。
- 建议本地先使用测试 Telegram Bot 和测试 Linode Token。
- 本地测试不要把生产 Bot webhook 改到本地 tunnel，除非已经人工确认。
- `LINODE_TOKEN_ENCRYPTION_KEY` 改掉后，旧本地 D1 里已加密的 Linode Token 会无法解密。

## 3. 初始化本地 D1 表

```bash
npx wrangler d1 execute linode-guard-lite --local --file=schema.sql
```

## 4. 启动本地 Worker

```bash
npm run dev -- --ip 127.0.0.1 --port 8787
```

Worker 地址：

```text
http://127.0.0.1:8787
```

## 5. 初始化默认设置和 Jobs

另开一个终端执行：

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" \
  -H "content-type: application/json" \
  --data '{"configure_telegram_webhook":false}' \
  http://127.0.0.1:8787/api/v1/setup/initialize
```

本地测试一般先不要让 setup 自动配置 Telegram webhook，因为本地 `127.0.0.1` Telegram 访问不到。

## 6. 本地自检

```bash
curl -sS http://127.0.0.1:8787/api/v1/health

curl -sS \
  -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/diagnostics/deployment

curl -sS \
  -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/diagnostics/jobs
```

期望：

- `/api/v1/health` 返回 `ok: true`
- deployment diagnostics 状态为 `ok`
- jobs diagnostics 状态为 `ok`

## 7. Telegram 本地联调

Telegram 需要公网 HTTPS URL 才能设置 webhook。可选方式：

1. 使用 Cloudflare Tunnel / ngrok / localtunnel 暴露本地 `http://127.0.0.1:8787`
2. 得到公网 HTTPS URL，例如：

```text
https://example-tunnel.trycloudflare.com
```

3. 设置 Telegram webhook：

```bash
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://example-tunnel.trycloudflare.com/telegram/webhook" \
  -d "secret_token=<YOUR_TELEGRAM_WEBHOOK_SECRET>"
```

4. 给测试 Bot 发送 `/start`。

如果 `.dev.vars` 没设置 `SUPER_ADMIN_TELEGRAM_IDS` / `SUPER_ADMIN_TELEGRAM_ID`，第一条 Telegram 消息会自动绑定为 Super Admin。

## 8. 本地 API 测试示例

查看账号：

```bash
curl -sS \
  -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/accounts
```

添加账号会调用真实 Linode API，请只使用测试 Token：

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" \
  -H "content-type: application/json" \
  --data '{"alias":"西班牙1","token":"<TEST_LINODE_TOKEN>"}' \
  http://127.0.0.1:8787/api/v1/accounts
```

## 9. 本地安全边界

本地测试默认只运行 typecheck、单元测试、dry-run build 和只读 API 检查。不要在没有人工确认的情况下运行真实 Linode 删除、关机、重启或批量操作测试。

如果需要测试删除 / 关机 / 重启：

- 使用测试 Linode 账号和测试实例。
- 明确确认目标 instance_id。
- 不要使用生产账号 Token。
- 不要把生产 Telegram Bot webhook 指向本地 tunnel。

## 10. 手动触发 Cron / Job Runner

Wrangler 本地不会自动触发 Scheduled Worker。如需手动触发：

```bash
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"
```

## 11. 本地验证命令

每轮提交前建议执行：

```bash
npm install
npm run typecheck
npm test
npm run build:upload
```

`build:upload` 是 Wrangler dry-run，用于提前发现 Worker 构建、D1 binding、Cron 和兼容性问题；不会部署生产 Worker。

## 12. 本轮验证记录

2026-05-15 本地验证通过：

```bash
npx wrangler d1 execute linode-guard-lite --local --file=schema.sql
npm run dev -- --ip 127.0.0.1 --port 8787
curl http://127.0.0.1:8787/api/v1/health
curl -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" http://127.0.0.1:8787/api/v1/diagnostics/deployment
curl -H "Authorization: Bearer <YOUR_API_AUTH_TOKEN>" http://127.0.0.1:8787/api/v1/diagnostics/jobs
```

结果：health OK，deployment diagnostics OK，setup initialize 后 jobs diagnostics OK。
