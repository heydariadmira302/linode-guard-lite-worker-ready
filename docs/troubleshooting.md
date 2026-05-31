# Troubleshooting

## Missing D1 binding DB

确认 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
```

部署后重新运行：

```bash
wrangler deploy
```

## 数据表缺失

执行：

```bash
wrangler d1 execute linode-guard-lite --file=schema.sql
```

然后检查：

```bash
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  https://<worker>/api/v1/diagnostics/deployment
```

## Telegram Webhook 不生效

检查：

- Webhook URL 是否是 `/telegram/webhook`
- `secret_token` 是否等于 `TELEGRAM_WEBHOOK_SECRET`
- Worker 是否已部署
- `SUPER_ADMIN_TELEGRAM_ID` 是否正确

## Telegram 消息发送失败

确认 `TELEGRAM_BOT_TOKEN` 正确，Bot 没有被用户屏蔽。

## Token 验证失败

Linode Token 无效时会返回 `TOKEN_INVALID`。请重新生成 Token。

## Linode API 权限不足

返回 `TOKEN_PERMISSION_ERROR` 时，说明 Token 权限不足。实例操作需要读取实例和管理实例权限；账号安全事件需要读取 account logins 权限。

## Cron 没执行

确认 `wrangler.toml`：

```toml
[triggers]
crons = ["* * * * *"]
```

Cloudflare Cron 不是秒级定时，可能有数分钟延迟。当前建议每分钟唤醒一次 Job Runner，再由 `jobs.next_run_at` 控制各任务实际频率。查看 `/api/v1/diagnostics/jobs` 和 `job_runs`。

## D1 migration 问题

确认 Worker 后台已经绑定 D1，变量名必须是 `DB`。必要时重新执行 `schema.sql`，或打开 `/setup` 页面重新初始化。

## GitHub 部署变量问题

如果使用 GitHub 集成部署，请确认 Worker 后台的 D1 binding `DB`、普通变量和所有 Worker Secrets 都已配置。
