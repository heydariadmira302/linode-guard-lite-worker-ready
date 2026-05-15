# 安全说明

## Linode Token 加密

Linode Token 使用独立的 `LINODE_TOKEN_ENCRYPTION_KEY` 加密后保存到 D1。API、Telegram、审计日志都不应返回 token 明文或 `encrypted_token`。该密钥可在首次 `/setup initialize` 时自动生成并保存到 D1，也可作为 Worker Secret 手动设置。若手动设置，应使用至少 32 字节随机值，例如 `openssl rand -base64 32`，不要使用短密码、Bot Token 或可猜测字符串。

建议为 Linode Token 使用最小必要权限。

## API Bearer Token

HTTP API 使用：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

该值可由首次 `/setup initialize` 自动生成，也可手动设置为强随机值。请仅保存在可信环境。

## Webhook Secret

Telegram Webhook 校验 `X-Telegram-Bot-Api-Secret-Token`，必须与独立的 `TELEGRAM_WEBHOOK_SECRET` 一致。该值可由首次 `/setup initialize` 自动生成，不要使用 Bot Token 充当 webhook secret。

## Super Admin

MVP 只允许一个 Super Admin Telegram 用户使用 Bot。可手动设置 `SUPER_ADMIN_TELEGRAM_ID`，也可让首次 Telegram 消息自动绑定。请给 Telegram 账号开启 2FA。

## 审计日志

高风险操作写入 `audit_logs`，包括：

- 实例开机 / 关机 / 重启 / 删除
- 批量操作
- 安全检查
- 管理员保活确认
- 策略组变更
- 定时任务变更
- Cron / Job Runner 执行产生的操作

## 删除风险

实例删除、批量删除、管理员保活策略触发删除所有实例都可能造成不可恢复的数据丢失。上线前请先用测试账号验证。

## 数据保留

- `OPERATION_LOG_RETENTION_DAYS`：审计日志保留天数
- `LOGIN_EVENT_RETENTION_DAYS`：登录事件保留天数

## Cloudflare 日志

不要在 Worker 日志中打印 Token、Authorization header、Telegram 用户输入的 Token 或 D1 中的 encrypted_token。