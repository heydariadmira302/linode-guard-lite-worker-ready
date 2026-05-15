# Cloudflare Worker ZIP 上传部署教程

本文适合不想用 GitHub 自动部署、只想下载源码压缩包后在 Cloudflare 上传部署的用户。

## 0. 下载源码 ZIP

打开仓库：

```text
https://github.com/heydariadmira302/linode-guard-lite-worker-ready
```

点击：

```text
Code -> Download ZIP
```

下载后解压。

确认解压后的项目根目录里能看到：

```text
package.json
wrangler.toml
src/
schema.sql
migrations/
```

如果 ZIP 解压后多了一层目录，比如：

```text
linode-guard-lite-worker-ready-main/package.json
```

上传前建议进入 `linode-guard-lite-worker-ready-main` 文件夹，把里面的内容重新压成一个 ZIP，确保 ZIP 根目录就是项目根目录。

## 1. 创建 D1 数据库

Cloudflare 后台进入：

```text
Workers & Pages -> D1
```

创建数据库，建议名称：

```text
linode-guard-lite
```

## 2. 创建 Worker

进入：

```text
Workers & Pages -> Create
```

选择 Worker 项目，并上传 ZIP 源码。

如果页面让你填写构建命令，可以使用：

```text
npm install
npm run typecheck
npx wrangler deploy
```

如果 Cloudflare 自动识别 `wrangler.toml`，保持默认也可以。

## 3. 绑定 D1

进入 Worker 设置：

```text
Settings -> Bindings -> Add binding -> D1 database
```

绑定名必须是：

```text
DB
```

数据库选择刚才创建的：

```text
linode-guard-lite
```

## 4. 添加最小 Secret

进入：

```text
Settings -> Variables and Secrets -> Secrets
```

只需要先添加：

```text
TELEGRAM_BOT_TOKEN
```

值是 BotFather 给你的 Telegram Bot Token。

下面三个不要先填也可以，首次初始化会自动生成：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

## 5. 部署 Worker

保存设置并部署。

部署成功后会得到 Worker 地址，例如：

```text
https://linode-guard-lite-worker-ready.xxx.workers.dev
```

## 6. 初始化

打开：

```text
https://你的-worker地址/setup
```

第一次初始化前，可以用：

```text
TELEGRAM_BOT_TOKEN
```

进入 setup 页面。

然后依次执行：

1. 初始化 Schema
2. 初始化默认设置
3. 初始化 Jobs / runtime secrets

初始化完成后，页面会返回并生成：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

请保存好这些值。

后续进入 `/setup` 或调用 HTTP API 时，使用 `API_AUTH_TOKEN`，不要再使用 Bot Token。

## 7. 设置 Telegram Webhook

把下面命令里的三个值换成自己的：

- `<TELEGRAM_BOT_TOKEN>`：BotFather 给你的 token
- `<WORKER_URL>`：你的 Worker 地址
- `<TELEGRAM_WEBHOOK_SECRET>`：初始化生成的 webhook secret

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<WORKER_URL>/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

## 8. 绑定管理员

给 Telegram bot 发送：

```text
/start
```

如果没有手动设置 `SUPER_ADMIN_TELEGRAM_ID`，第一次给 bot 发消息的人会自动绑定为 Super Admin。

因此第一次消息必须由你本人发送。

## 9. 添加 Linode Token

进入 Telegram bot 菜单后添加 Linode 账号 Token。

Linode Token 不需要填 Cloudflare 环境变量。它会通过 bot 添加，并加密保存到 D1。

## 最小配置总结

手动配置：

```text
D1 binding: DB
Secret: TELEGRAM_BOT_TOKEN
Cron: */5 * * * *
```

初始化自动生成：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

通过 bot 添加：

```text
Linode Token
```
