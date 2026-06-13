# Linode Guard Lite 5 分钟极速部署

这份是最短路径。适合已经有 Cloudflare / GitHub / Telegram Bot 的用户快速跑起来。

> 安全提醒：不要把 Telegram Bot Token、Cloudflare Token、Linode Token、`.dev.vars`、`.env` 提交到 GitHub 或发到公开聊天里。

## 你需要先准备

- 一个 GitHub 账号
- 一个 Cloudflare 账号
- 一个 Telegram Bot Token：从 `@BotFather` 创建 Bot 后获得

Linode Token 不需要部署时准备，部署完成后在 Telegram 里添加账号时再填。

## 1. Fork 仓库

打开：

```text
https://github.com/<YOUR_GITHUB_REPO>
```

点击 `Fork`，建议 Fork 到你自己的私有仓库。

## 2. Cloudflare 导入 GitHub 仓库

进入 Cloudflare Dashboard：

```text
Workers & Pages → Create → Pages / Workers → Connect to Git
```

选择你 Fork 后的仓库。

构建命令建议：

```bash
npm install && npm run build:upload
```

Worker 入口以仓库里的 `wrangler.toml` 为准：

```text
main = "src/index.ts"
```

## 3. 创建并绑定 D1

在 Cloudflare 创建 D1 数据库：

```text
linode-guard-lite
```

然后到 Worker 设置里绑定：

```text
Binding type: D1 database
Variable name: DB
Database: linode-guard-lite
```

变量名必须是：

```text
DB
```

## 4. 配置最小 Secret

到 Worker：

```text
Settings → Variables and Secrets → Secrets
```

只需要先添加一个：

```text
TELEGRAM_BOT_TOKEN=<BotFather 给你的 Bot Token>
```

以下三个可以首次初始化时自动生成，不必先填：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

`SUPER_ADMIN_TELEGRAM_IDS` 也可以不填，首次给 Bot 发消息的人会自动绑定为管理员；如需多个最高权限管理员，填多个 Telegram 数字 ID（逗号/空格/换行分隔）。旧的 `SUPER_ADMIN_TELEGRAM_ID` 仍兼容。

## 5. 设置 Cron Trigger

在 Worker 的 Triggers / Cron Triggers 添加：

```text
* * * * *
```

它负责唤醒 Job Runner。Job Runner 会用 `jobs.next_run_at` 控制各任务实际频率；消息隐私清理可接近每分钟执行，登录监控、定时任务、保活策略等常规任务默认约 5 分钟一轮。

## 6. 打开 /setup 初始化

部署完成后打开：

```text
https://<你的 Worker 域名>/setup
```

管理 Token 输入：

- 如果你只设置了 `TELEGRAM_BOT_TOKEN`，首次初始化可以先输入 `TELEGRAM_BOT_TOKEN`
- 如果你已经手动设置了 `API_AUTH_TOKEN`，就输入 `API_AUTH_TOKEN`

按顺序点击：

1. 初始化数据库表结构
2. 初始化默认设置和系统 jobs
3. 检查部署状态
4. 检查 jobs

看到 `ok: true` 且检查通过，就说明数据库和 jobs 已准备好。

初始化后，系统会自动生成 runtime secrets 并保存到 D1：

```text
API_AUTH_TOKEN
TELEGRAM_WEBHOOK_SECRET
LINODE_TOKEN_ENCRYPTION_KEY
```

普通响应不会展示 webhook secret 或加密密钥明文。

## 7. 设置 Telegram Webhook

Webhook 地址：

```text
https://<你的 Worker 域名>/telegram/webhook
```

如果你在 `/setup` 页面选择了自动配置 webhook，并且页面显示成功，可以跳过手动 curl。

手动设置示例：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<你的 Worker 域名>/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

如果你不知道 `TELEGRAM_WEBHOOK_SECRET`，建议在 Worker Secrets 里手动设置一个强随机值，然后重新设置 webhook。

## 8. Telegram 里发 /start

打开你的 Telegram Bot，发送：

```text
/start
```

如果没有设置 `SUPER_ADMIN_TELEGRAM_IDS` / `SUPER_ADMIN_TELEGRAM_ID`，第一位成功发送消息的 Telegram 用户会自动绑定为 Super Admin。

## 9. 添加 Linode 账号

在 Telegram 菜单里进入：

```text
账号 → 添加账号
```

流程：

1. 输入账号昵称，例如 `西班牙1`
2. 选择分组
3. 输入 Linode API Token
4. 系统检测 Token
5. 建立安全基线，历史登录不会通知

建议先用测试 Linode 账号 / 测试实例验证。

## 10. 上线后先做的安全检查

建议依次确认：

- `系统自检 / 诊断中心` 正常
- `Jobs` 检查正常
- `安全 → 保护实例`：把关键实例加入 protected instance
- 批量删除、保活自动删机这类高危策略先别急着开
- 用测试实例验证开机 / 关机 / 定时任务

## 常见卡点

### /setup 显示未授权

首次初始化可输入 `TELEGRAM_BOT_TOKEN`；初始化完成后应使用 `API_AUTH_TOKEN`。

### Telegram 没反应

检查：

- Webhook URL 是否是 `/telegram/webhook`
- Webhook secret 是否和 Worker 里的一致
- Bot Token 是否正确
- 是否已经绑定了别的 Super Admin

### D1 报缺表

新部署用 `/setup` 页面点“初始化数据库表结构”。不要在新库上重复执行 legacy migrations `0002` 到 `0006`。

### 真实删除风险

删除实例、批量删除、保活自动删机会造成不可恢复的数据丢失。上线前建议先设置 protected instance，并用测试实例验证。
