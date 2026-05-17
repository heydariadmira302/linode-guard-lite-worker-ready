# Local Development / 本地测试

本项目可以先在本地用 Wrangler + 本地 D1 跑通，再考虑推 GitHub 和部署 Cloudflare Worker。

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
API_AUTH_TOKEN="local-dev-api-token-change-me"
TELEGRAM_WEBHOOK_SECRET="local-dev-telegram-webhook-secret-change-me"
LINODE_TOKEN_ENCRYPTION_KEY="local-dev-linode-token-encryption-key-change-me"
# SUPER_ADMIN_TELEGRAM_ID="你的 Telegram 数字 ID，可选"
```

注意：

- `.dev.vars` 已在 `.gitignore`，不要提交真实密钥。
- 建议本地先使用测试 Telegram Bot 和测试 Linode Token。
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
  -H "Authorization: Bearer local-dev-api-token-change-me" \
  -H "content-type: application/json" \
  --data '{"configure_telegram_webhook":false}' \
  http://127.0.0.1:8787/api/v1/setup/initialize
```

本地测试一般先不要让 setup 自动配置 Telegram webhook，因为本地 `127.0.0.1` Telegram 访问不到。

## 6. 本地自检

```bash
curl -sS http://127.0.0.1:8787/api/v1/health

curl -sS \
  -H "Authorization: Bearer local-dev-api-token-change-me" \
  http://127.0.0.1:8787/api/v1/diagnostics/deployment

curl -sS \
  -H "Authorization: Bearer local-dev-api-token-change-me" \
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
  -d "secret_token=local-dev-telegram-webhook-secret-change-me"
```

4. 给测试 Bot 发送 `/start`。

如果 `.dev.vars` 没设置 `SUPER_ADMIN_TELEGRAM_ID`，第一条 Telegram 消息会自动绑定为 Super Admin。

## 8. 本地 API 测试示例

查看账号：

```bash
curl -sS \
  -H "Authorization: Bearer local-dev-api-token-change-me" \
  http://127.0.0.1:8787/api/v1/accounts
```

添加账号会调用真实 Linode API，请只使用测试 Token：

```bash
curl -sS -X POST \
  -H "Authorization: Bearer local-dev-api-token-change-me" \
  -H "content-type: application/json" \
  --data '{"alias":"西班牙1","token":"<TEST_LINODE_TOKEN>"}' \
  http://127.0.0.1:8787/api/v1/accounts
```

## 9. 手动触发 Cron / Job Runner

Wrangler 本地不会自动触发 Scheduled Worker。如需手动触发：

```bash
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"
```

## 10. 本轮验证记录

2026-05-15 本地验证通过：

```bash
npx wrangler d1 execute linode-guard-lite --local --file=schema.sql
npm run dev -- --ip 127.0.0.1 --port 8787
curl http://127.0.0.1:8787/api/v1/health
curl -H "Authorization: Bearer local-dev-api-token-change-me" http://127.0.0.1:8787/api/v1/diagnostics/deployment
curl -H "Authorization: Bearer local-dev-api-token-change-me" http://127.0.0.1:8787/api/v1/diagnostics/jobs
```

结果：health OK，deployment diagnostics OK，setup initialize 后 jobs diagnostics OK。
