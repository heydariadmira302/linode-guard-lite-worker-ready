# Cloudflare Workers ZIP 上传部署

这种方式适合不绑定 GitHub、只想本地构建后手动上传 Worker 文件的自用部署。

## 1. 本地生成上传包

```bash
npm install
npm run typecheck
npm test
npm run build:zip
```

生成文件：

```text
release/linode-guard-lite-worker.zip
```

压缩包里包含：

```text
index.js
schema.sql
wrangler.toml.example
secrets.example.md
DEPLOY-ZIP.md
README.txt
```

实际 Worker 代码是 `index.js`。

## 2. 在 Cloudflare 创建 Worker 并上传

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages。
3. 创建 Worker。
4. 使用 Cloudflare 控制台支持的上传方式上传 `index.js` 或 `release/linode-guard-lite-worker.zip`。
5. 保存并部署。

如果控制台只接受单文件，请从 zip 中解压并上传 `index.js`。

## 3. 手动创建并绑定 D1

创建 D1 数据库，例如：

```text
linode-guard-lite
```

绑定到 Worker：

```text
Binding type: D1 database
Variable name: DB
Database: linode-guard-lite
```

变量名必须是 `DB`。

## 4. KV

当前版本不需要 KV。

不要创建 KV 也可以正常运行。

## 5. 最少需要手动配置什么？

自用部署只需要配置这三类：

1. 一个 D1 数据库绑定：`DB`
2. 一个最小必填 Secret：`TELEGRAM_BOT_TOKEN`
3. 一个 Cron Trigger：`*/5 * * * *`

最简清单：

```text
D1 绑定名：DB

最小必填 Secret：
TELEGRAM_BOT_TOKEN=从 BotFather 拿到

首次执行 /setup initialize 后，系统会自动生成并保存：
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY

如果你愿意，也可以手动预先设置这三个值。

SUPER_ADMIN_TELEGRAM_ID 可选：不设置时，首次 Telegram 消息会自动绑定。

Cron：
*/5 * * * *
```

普通 Variables 可以先不填，程序已有默认值。

## 6. Secrets 配置说明

在 Worker 的 Settings → Variables and Secrets → Secrets 中添加下面 5 个。

### 6.1 `TELEGRAM_BOT_TOKEN`

这是你的 Telegram 机器人 Token。

获取方式：

1. Telegram 搜索 `@BotFather`。
2. 发送 `/newbot` 创建机器人。
3. BotFather 会返回一串 token，格式类似：

```text
1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

把这整串填到：

```text
TELEGRAM_BOT_TOKEN
```

### 6.2 `TELEGRAM_WEBHOOK_SECRET`

这个值可以由首次 `/setup initialize` 自动生成。

如果你想手动预置，也可以自己生成一串长随机字符串，例如：

```text
lg_webhook_8f3a9c2d7e1b4a6f9c0d2e5a
```

要求：

- 不要用中文
- 不要太短
- 不要和 Bot Token 一样

### 6.3 `SUPER_ADMIN_TELEGRAM_ID`

这是你的 Telegram 用户 ID，不是用户名，也不是手机号。

如果不设置，首次 Telegram 消息会自动绑定当前用户。

如果你想手动设置，也可以填 Telegram 数字 ID，例如：

```text
123456789
```

这个 ID 用来限制只有你本人能操作机器人。

### 6.4 `API_AUTH_TOKEN`

这个值可以由首次 `/setup initialize` 自动生成。

如果你想手动预置，也可以自己生成一串长随机字符串，例如：

```text
lg_api_2d7f9a4c8b1e6f0a3c5d9e7b
```

### 6.5 `LINODE_TOKEN_ENCRYPTION_KEY`

这个值可以由首次 `/setup initialize` 自动生成。

如果你想手动预置，也可以自己生成一串长随机字符串，例如：

```text
lg_encrypt_6c1f8e2a9b4d7f0c3e5a8d2b
```

注意：

- 这个值设置后不要随便改。
- 如果改了，之前已经保存到 D1 的 Linode Token 可能无法解密，需要重新添加 Linode 账号。

## 7. 可选 Variables，可以先不填

这些可以不设置，程序会用默认值：

```text
APP_TIMEZONE=Asia/Shanghai
BATCH_CONCURRENCY=5
OPERATION_LOG_RETENTION_DAYS=1
LOGIN_EVENT_RETENTION_DAYS=1
```

含义：

- `APP_TIMEZONE`：默认时区，默认 `Asia/Shanghai`。
- `BATCH_CONCURRENCY`：批量操作并发数，默认 `5`。
- `OPERATION_LOG_RETENTION_DAYS`：审计日志保留天数，默认 `1` 天。
- `LOGIN_EVENT_RETENTION_DAYS`：登录事件保留天数，默认 `1` 天。

如果你看不懂，先一个都不用填。

## 8. 设置 Cron Trigger

添加 Cron Trigger：

```text
*/5 * * * *
```

它负责：

- 登录事件监控
- 保活提醒
- 定时开关机
- 清理任务

## 9. 初始化数据库

部署后访问：

```text
https://<你的 Worker 域名>/setup
```

输入 `API_AUTH_TOKEN`，然后依次点击：

1. 初始化数据库表结构
2. 初始化默认设置和系统 jobs
3. 检查部署状态
4. 检查 jobs

## 10. 设置 Telegram Webhook

Webhook URL：

```text
https://<你的 Worker 域名>/telegram/webhook
```

设置时必须带 `TELEGRAM_WEBHOOK_SECRET`。

示例：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<你的 Worker 域名>/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

## 11. 自检

```bash
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  "https://<你的 Worker 域名>/api/v1/diagnostics/deployment"

curl -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  "https://<你的 Worker 域名>/api/v1/diagnostics/jobs"
```

两个接口都应返回：

```json
{
  "ok": true,
  "data": {
    "status": "ok"
  }
}
```

## 12. 后续更新

修改代码后重新执行：

```bash
npm run build:zip
```

然后重新上传新的 `release/linode-guard-lite-worker.zip` 或其中的 `index.js`。

D1、Secrets、Variables 和 Cron 不需要每次重设，除非你删除了 Worker 或换了 Worker。 
