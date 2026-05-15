# Secrets 示例

这些值不要写入 `wrangler.toml`，也不要提交真实密钥。

## 最小必填 Secret

```text
TELEGRAM_BOT_TOKEN
```

`TELEGRAM_BOT_TOKEN` 来自 BotFather，用于 Telegram Bot 收发消息、编辑消息、删除消息和设置 webhook。

## 自动生成的运行时密钥

首次执行 `/setup initialize` 后，系统会自动生成并保存到 D1 的 `settings.runtime_secrets`：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

生成后请从初始化结果里复制：

- `API_AUTH_TOKEN`：后续 HTTP API 的 Bearer Token。
- `TELEGRAM_WEBHOOK_SECRET`：设置 Telegram webhook 时的 `secret_token`。
- `LINODE_TOKEN_ENCRYPTION_KEY`：用于加密保存在 D1 里的 Linode Token。

也可以选择在 Cloudflare Worker Secrets 里手动设置这些值；环境 Secret 优先级高于 D1 自动生成值。

## 可选 Secret

```text
SUPER_ADMIN_TELEGRAM_ID
```

如果不设置，首次通过 Telegram 访问 bot 的用户会自动绑定为 Super Admin。

## 普通变量

普通变量可以放在 `wrangler.toml` 的 `[vars]` 中：

```toml
APP_TIMEZONE = "Asia/Shanghai"
BATCH_CONCURRENCY = "5"
OPERATION_LOG_RETENTION_DAYS = "1"
LOGIN_EVENT_RETENTION_DAYS = "1"
```
