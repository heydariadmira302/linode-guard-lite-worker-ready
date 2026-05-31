# Cloudflare Worker 部署：下载 ZIP 后怎么部署

> 重要：不要选择“上传静态文件”。
>
> Cloudflare 中文后台里的“上传静态文件”通常是 Pages / 静态网站入口，只适合 HTML/CSS/JS 静态站点。本项目是 Cloudflare Worker 后端项目，包含 TypeScript、D1、Telegram Webhook、Cron，不是静态文件项目。

## 推荐方式：GitHub 导入部署

即使你是先下载 ZIP，也建议把源码上传到 GitHub 仓库，再让 Cloudflare 从 GitHub 部署。

仓库地址：

```text
https://github.com/<YOUR_GITHUB_REPO>
```

## 中文后台操作路径

### 1. 进入 Workers

Cloudflare 后台左侧进入：

```text
Workers 和 Pages
```

然后选择：

```text
创建应用程序 / 创建
```

不要选：

```text
Pages -> 上传资产 / 上传静态文件
```

应该选择 Worker 或从 Git 仓库导入。

常见中文入口可能叫：

```text
Workers
从 Git 开始
导入存储库
连接到 Git
```

不同 Cloudflare 后台版本文字略有不同，但原则是：

```text
选 Worker，不选 Pages 静态上传。
```

### 2. 连接 GitHub 仓库

选择 GitHub 仓库：

```text
<YOUR_GITHUB_REPO>
```

如果你自己 fork 或重新上传到了自己的 GitHub，就选择你自己的仓库。

### 3. 构建设置

如果页面要求填写构建命令，可填：

```text
npm run typecheck
```

如果页面要求部署命令，可填：

```text
npx wrangler deploy
```

如果 Cloudflare 自动识别 `wrangler.toml`，可以保持默认。

项目根目录：

```text
/
```

### 4. 绑定 D1

进入 Worker 项目设置：

```text
设置 -> 绑定 -> 添加绑定 -> D1 数据库
```

绑定变量名必须是：

```text
DB
```

数据库选择你创建的：

```text
linode-guard-lite
```

### 5. 添加 Secret

进入：

```text
设置 -> 变量和机密 -> 机密
```

先只添加：

```text
TELEGRAM_BOT_TOKEN
```

值是 BotFather 给你的 Telegram Bot Token。

下面三个不用先填，初始化会自动生成：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

### 6. 部署后初始化

部署成功后访问：

```text
https://你的-worker地址/setup
```

第一次初始化前，用：

```text
TELEGRAM_BOT_TOKEN
```

进入 setup 页面。

初始化后保存系统生成的：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

### 7. 设置 Telegram Webhook

用初始化生成的 `TELEGRAM_WEBHOOK_SECRET` 设置 webhook：

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://你的-worker地址/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

### 8. 绑定管理员

给 Telegram bot 发送：

```text
/start
```

如果没有手动设置 `SUPER_ADMIN_TELEGRAM_ID`，第一次给 bot 发消息的人会自动绑定为 Super Admin。

## 如果你一定要用 ZIP

Cloudflare 后台的“上传静态文件”不适合本项目。

ZIP 的正确用法是：

1. 下载 ZIP
2. 解压
3. 上传到 GitHub 仓库
4. Cloudflare 从 GitHub 导入部署

或者在本地安装 Wrangler 后，在解压目录执行：

```bash
npm install
npx wrangler login
npx wrangler deploy
```

但对小白用户来说，GitHub 导入部署更稳。
