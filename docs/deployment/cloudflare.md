# Linode Guard Lite 小白版 Cloudflare 部署教程

这是一份尽量按 Cloudflare 当前网页界面来写的部署教程。目标是：先在 GitHub fork 项目，然后在 Cloudflare Dashboard 里进入 **计算 / Compute → Workers & Pages**，连接 GitHub 仓库，创建 D1，设置变量和 Secrets，最后部署 Worker、设置 Telegram Webhook。

项目仓库：

```text
https://github.com/<YOUR_GITHUB_REPO>
```

> 重要安全提醒：不要把任何真实密钥提交到 GitHub，包括 GitHub key、Cloudflare API Token、Telegram Bot Token、Linode Token、`.env`、`.dev.vars`。仓库里的 `wrangler.toml` 只放 Worker 入口、D1 绑定名、Cron 和普通默认变量；首次 `/setup initialize` 会自动生成独立的 runtime secrets 并保存到 D1，生产环境也可以选择手动单独设置。

> 重要功能提醒：Linode Guard Lite 会执行真实 Linode 操作。首次部署后先用测试 Linode 账号 / 测试实例，不要一上来配置删除、批量删除、`delete_all_instances`。

---

## 0. 你最终会得到什么

部署完成后会有：

- 一个 Cloudflare Worker：运行 Linode Guard Lite 的 HTTP API 和 Telegram Webhook。
- 一个 Cloudflare D1 数据库：保存账号、加密后的 Linode Token、审计日志、定时任务、Job Runner 运行记录。
- 一个 Cloudflare Cron Trigger：每 1 分钟执行 Job Runner。
- 一个 Telegram Bot：作为默认手机操作入口。
- 一组 HTTP API：以后可以继续接 Web UI、CLI、Webhook、手机快捷指令或自动化脚本。

本项目当前**必须创建 D1**。

如果你想最省事，真正需要先准备的只有：

- `TELEGRAM_BOT_TOKEN`

第一次 `/setup initialize` 之后，系统会自动生成并保存独立的 `API_AUTH_TOKEN`、`TELEGRAM_WEBHOOK_SECRET` 和 `LINODE_TOKEN_ENCRYPTION_KEY`。如果你愿意，也可以在 Worker Secrets 里手动设置这些值。

其他几个敏感项可以先不填：

- `TELEGRAM_WEBHOOK_SECRET` 会在首次 `/setup initialize` 时自动生成
- `API_AUTH_TOKEN` 会在首次 `/setup initialize` 时自动生成
- `LINODE_TOKEN_ENCRYPTION_KEY` 会在首次 `/setup initialize` 时自动生成
- `SUPER_ADMIN_TELEGRAM_ID` 可以在首次 Telegram 消息时自动绑定

如果你希望更安全，后面再逐个单独设置也可以。

本项目当前**不需要 KV**，代码里没有使用 KV binding。如果你在 Cloudflare 界面里看到 KV，可以先不用创建。教程后面会单独说明“什么时候需要 KV”。

---

## 1. 先 fork GitHub 项目

### 1.1 打开项目

在浏览器打开：

```text
https://github.com/<YOUR_GITHUB_REPO>
```

### 1.2 点击 Fork

GitHub 页面右上角点击：

```text
Fork
```

然后按下面填写：

- Owner：选择你自己的 GitHub 账号或组织。
- Repository name：建议保持 `linode-guard-lite`。
- Description：可以不填。
- Copy the `main` branch only：建议勾选。
- Visibility：建议选择 `Private`。

最后点击：

```text
Create fork
```

完成后，你会得到自己的仓库，例如：

```text
https://github.com/<你的GitHub用户名>/linode-guard-lite-worker-ready
```

后面 Cloudflare 要连接的是你自己的 fork，不是原始仓库。

> 如果 GitHub 页面没有 Fork 按钮，或者提示你没有权限，说明你当前 GitHub 账号没有访问这个仓库。先确认你登录的是有权限的 GitHub 账号。

---

## 2. 登录 Cloudflare

打开 Cloudflare Dashboard：

```text
https://dash.cloudflare.com/
```

登录后，如果你有多个 Cloudflare Account，先在左上角确认当前账号是你准备用来部署 Worker 的账号。

---

## 3. 先创建 D1 数据库

D1 是必须的。没有 D1，Worker 虽然可能部署成功，但系统无法保存账号、任务和审计日志。

### 3.1 进入 D1 页面

在 Cloudflare 左侧菜单里找到数据库入口。不同账号界面文案可能略有差异，常见路径是：

```text
存储和数据库 / Storage & Databases → D1 SQL Database
```

或者：

```text
Workers & Pages → D1
```

如果左侧没有看到，可以用顶部搜索框搜索：

```text
D1
```

### 3.2 创建数据库

点击：

```text
Create database
```

数据库名称填写：

```text
linode-guard-lite
```

点击创建。

### 3.3 记录 database id

创建完成后，进入这个 D1 数据库详情页，找到数据库 ID。

一般会显示类似：

```text
Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

把这个 ID 复制保存，后面配置 Worker binding 时会用到。

---

## 4. 绑定 D1 后，用网页激活初始化数据库

这一步改成网页操作：项目部署好、D1 绑定好以后，直接打开 Worker 自带的初始化页面，用按钮完成数据库安装。

你**不需要**：

- 打开 D1 SQL Console。
- 复制 `schema.sql`。
- 粘贴 SQL。
- 一个表一个表手动创建。
- 手动往表里填数据。

### 4.1 先确认 D1 已绑定到 Worker

进入：

```text
Workers & Pages → linode-guard-lite → Settings → Bindings
```

确认已经有 D1 database binding：

- Type：D1 database
- Variable name：`DB`
- Database：`linode-guard-lite`

这里最重要的是变量名必须叫：

```text
DB
```

### 4.2 打开网页初始化安装页

Worker 部署完成后，浏览器打开：

```text
https://<你的Worker地址>/setup
```

例如：

```text
https://linode-guard-lite.<你的子域>.workers.dev/setup
```

页面标题是：

```text
Linode Guard Lite 初始化安装
```

### 4.3 输入管理 Token

在页面里输入你手上方便使用的 token。

- 如果你单独设置了 `API_AUTH_TOKEN`，就输入它
- 如果你没单独设置，直接输入 `TELEGRAM_BOT_TOKEN` 也可以

这个 token 用来证明你是管理员。它只在浏览器里发请求给你的 Worker，不会写入数据库。

### 4.4 点击初始化按钮

在 `/setup` 页面按顺序点击：

1. `初始化数据库表结构`
2. `初始化默认设置和系统 jobs`
3. `检查部署状态`
4. `检查 jobs`

如果你是最省事模式，这一步主要确认 `TELEGRAM_BOT_TOKEN` 已经到位；其余几个敏感项会在初始化时自动生成。

每一步都会在页面下方显示返回结果。

看到 `ok: true`，并且部署检查、jobs 检查没有明显错误，就说明初始化完成。

### 4.5 这一步到底做了什么

点击 `初始化数据库表结构` 时，Worker 会自动调用：

```text
POST /api/v1/setup/schema
```

它会用 Worker 内置的 schema 自动创建 D1 表。

点击 `初始化默认设置和系统 jobs` 时，Worker 会自动调用：

```text
POST /api/v1/setup/initialize
```

它会写入默认 settings、jobs 和管理员保活初始记录。

所以你不用关心有哪些表，也不用手动填写任何表。


---

## 4A. D1 初始化与旧库迁移安全

### 新部署

新部署只需要执行一种初始化方式：

- 通过 `/setup` 页面点击“初始化数据库表结构”；或
- 手动执行 `schema.sql`；或
- 手动执行 `migrations/0001_initial.sql`。

不要在新库上继续执行 `migrations/0002_legacy_group_compat.sql`、`0003_power_schedules_group_scope.sql`、`0004_power_schedules_instance_scope.sql`、`0005_job_locks.sql`、`0006_bot_managed_instances.sql`。这些是旧库兼容迁移，部分脚本包含 `ALTER TABLE ADD COLUMN`，D1/SQLite 不允许重复添加同名列；新库的 `schema.sql` / `0001_initial.sql` 已包含当前完整表结构。

### 旧部署

旧 D1 升级前必须先做 schema inspect。推荐检查：

```sql
PRAGMA table_info(linode_accounts);
PRAGMA table_info(power_schedules);
PRAGMA table_info(schedule_runs);
PRAGMA table_info(jobs);
SELECT name FROM sqlite_master WHERE type='table';
```

按检查结果决定：

- `linode_accounts.group_id` 不存在时，才执行 `0002_legacy_group_compat.sql`。
- `power_schedules.group_id` 不存在时，才执行 `0003_power_schedules_group_scope.sql`。
- `power_schedules.instance_id` 或 `schedule_runs.instance_id` 不存在时，才执行 `0004_power_schedules_instance_scope.sql`。
- `jobs.locked_until` / `jobs.locked_by` / `jobs.lock_started_at` 不存在时，才执行 `0005_job_locks.sql`。
- `bot_managed_instances` 表不存在时，才执行 `0006_bot_managed_instances.sql`。

如果列已经存在，不要重复执行对应 migration。

---

## 5. 关于 KV：当前版本不用创建

Cloudflare 有 KV，但 Linode Guard Lite 当前版本不使用 KV。

代码里需要的 Cloudflare binding 只有：

```text
DB
```

也就是 D1 数据库 binding。

所以小白部署时：

- 不需要创建 KV Namespace。
- 不需要设置 KV binding。
- 不要自己随便填 `kv_namespaces`。

如果 Cloudflare 后台让你添加 KV，可以跳过。

只有未来版本真的加入缓存、限流、临时状态等功能时，才可能需要 KV。到时候文档会明确写需要哪个 binding 名称。

---

## 6. 进入 Workers & Pages 创建应用

### 6.1 打开 Workers & Pages

Cloudflare 左侧菜单进入：

```text
计算 / Compute → Workers & Pages
```

英文界面一般是：

```text
Compute → Workers & Pages
```

有些账号左侧可能直接显示：

```text
Workers & Pages
```

### 6.2 创建应用

点击：

```text
Create application
```

然后选择类似：

```text
Import a repository
```

或者：

```text
Import from Git
```

或者：

```text
Connect to Git
```

Cloudflare 的官方说明是：在 Workers & Pages 页面点击 **Create application**，可以导入你自己的 Git 仓库。

---

## 7. 连接 GitHub 仓库

### 7.1 授权 GitHub

如果你第一次用 Cloudflare 连接 GitHub，页面会要求安装 GitHub App。

GitHub App 名称通常是：

```text
Cloudflare Workers and Pages
```

授权时建议选择：

```text
Only select repositories
```

然后只选择你的 fork：

```text
<你的GitHub用户名>/linode-guard-lite
```

不要授权所有仓库，避免权限过大。

### 7.2 选择仓库

回到 Cloudflare 页面后，选择你的 fork 仓库：

```text
linode-guard-lite
```

点击继续。

---

## 8. 配置 Worker 构建和部署

Cloudflare 导入 GitHub 仓库后，会让你配置项目。

### 8.1 项目名称

Project name / 项目名填写：

```text
linode-guard-lite
```

### 8.2 分支

Production branch / 生产分支选择：

```text
main
```

### 8.3 构建命令

如果页面有 Build command / 构建命令，填写：

```bash
npm run typecheck && npm test && npm run build:upload
```

说明：Cloudflare 会自动安装依赖，这里只做检查，避免重复 `npm install`。`build:upload` 是 Wrangler dry-run，用于提前发现 Worker 构建、D1 binding、Cron、兼容性配置问题。如果你想首次部署更快，也可以先临时只填：

```bash
npm run typecheck && npm test
```

### 8.4 部署命令

如果页面有 Deploy command / 部署命令，填写：

```bash
npx wrangler deploy
```

### 8.5 根目录

Root directory / 根目录一般留空，或填写：

```text
/
```

因为项目文件就在仓库根目录。

### 8.6 配置文件：仓库已经带 `wrangler.toml`

仓库根目录已经提交了一个可公开保存的：

```text
wrangler.toml
```

它的作用是让 Cloudflare Git 自动部署知道：

- Worker 入口是 `src/index.ts`
- D1 binding 名字是 `DB`
- Cron 每分钟唤醒一次 Job Runner，具体任务频率由 `jobs.next_run_at` 控制
- 普通默认变量是什么

你不需要自己新建这个文件，也不需要上传 `.env`。

你不需要改 `database_id`。这个文件里故意不写 `database_id`，小白不用复制粘贴数据库 ID。

D1 直接在 Cloudflare Worker 后台绑定：

```text
Settings → Bindings / Variables and Secrets → Add → D1 database
```

绑定时只要记住一件事：变量名必须叫 `DB`。

> `wrangler.toml` 里不要写 Telegram Bot Token、Linode Token、GitHub Token、Cloudflare API Token。D1、变量和所有密钥都在 Cloudflare Worker 后台设置。

---

## 9. 设置 D1 Binding

这是最关键的一步。Binding 名称必须叫：

```text
DB
```

不能叫 `DATABASE`、`D1`、`LINODE_DB`，否则代码找不到数据库。

### 9.1 打开 Worker 设置

进入你的 Worker 项目：

```text
Workers & Pages → linode-guard-lite
```

进入：

```text
Settings → Bindings
```

或者新版界面可能是：

```text
Settings → Variables and Secrets → Bindings
```

### 9.2 添加 D1 binding

点击：

```text
Add
```

类型选择：

```text
D1 database
```

Variable name / 变量名填写：

```text
DB
```

D1 database 选择你前面创建的：

```text
linode-guard-lite
```

保存并部署。Cloudflare 页面上的按钮可能叫：

```text
Deploy
```

或者：

```text
Save and deploy
```

---

## 10. 设置普通变量 Variables：默认不用手动填

仓库里的 `wrangler.toml` 已经写好了这些普通变量默认值；如果 Cloudflare 后台显示为空，也可以在后台手动添加同名变量：

```text
APP_TIMEZONE = Asia/Shanghai
BATCH_CONCURRENCY = 5
OPERATION_LOG_RETENTION_DAYS = 1
LOGIN_EVENT_RETENTION_DAYS = 1
```

所以小白部署时，这一节通常可以先跳过。

如果你想显式设置，或者 Cloudflare 后台没有带出这些值，就进入：

```text
Workers & Pages → linode-guard-lite → Settings → Variables and Secrets
```

添加同名 Text / Variable 覆盖默认值。

---

## 11. 设置 Secrets 密钥

还是在：

```text
Settings → Variables and Secrets
```

添加下面这些时，Type 要选择：

```text
Secret
```

不要选择普通 Text。Secret 会被 Cloudflare 加密保存，页面之后也不会明文显示。

### 11.1 TELEGRAM_BOT_TOKEN

这个是 BotFather 给你的 Telegram Bot Token。

- Type：Secret
- Name：

```text
TELEGRAM_BOT_TOKEN
```

- Value：填写 BotFather 给你的 token。

### 11.2 TELEGRAM_WEBHOOK_SECRET

这是 Telegram Webhook secret，用来防止别人伪造 Telegram 请求。

- Type：Secret
- Name：

```text
TELEGRAM_WEBHOOK_SECRET
```

- Value：自己生成一个随机字符串。

可以用这个命令生成：

```bash
openssl rand -base64 32
```

如果你不会用命令，也可以用密码管理器生成一串随机值。

### 11.3 SUPER_ADMIN_TELEGRAM_ID

这是你的 Telegram 数字 user id，不是用户名，不是 `@xxx`。

- Type：Secret
- Name：

```text
SUPER_ADMIN_TELEGRAM_ID
```

- Value：你的 Telegram numeric user id，例如：

```text
123456789
```

获取方式：可以在 Telegram 搜索 `userinfobot` 或类似工具查询自己的数字 ID。

### 11.4 API_AUTH_TOKEN

这是 HTTP API 的 Bearer Token。

- Type：Secret
- Name：

```text
API_AUTH_TOKEN
```

- Value：随机生成一串长 token。

建议用：

```bash
openssl rand -base64 32
```

以后调用 API 时要这样带上：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

### 11.5 LINODE_TOKEN_ENCRYPTION_KEY

这是用来加密保存 Linode Token 的密钥，非常重要。

- Type：Secret
- Name：

```text
LINODE_TOKEN_ENCRYPTION_KEY
```

- Value：至少 32 字节随机值。

建议生成：

```bash
openssl rand -base64 32
```

> 这个密钥设置后不要随便更换。更换后，D1 里已经保存的 encrypted Linode Token 可能无法解密。

---

## 12. 设置 Cron Trigger：默认不用手动加

仓库里的 `wrangler.toml` 已经写好了：

```toml
[triggers]
crons = ["* * * * *"]
```

意思是每分钟唤醒一次 Job Runner。Job Runner 会用 `jobs.next_run_at` 控制各任务实际频率；当前默认所有系统 job 均按约 1 分钟一轮检查。Cloudflare 用 `npx wrangler deploy` 部署时会自动带上这个 Cron Trigger。

如果你在 Cloudflare 后台没有看到 Cron，或者你想手动确认，可以进入：

```text
Workers & Pages → linode-guard-lite → Settings → Triggers → Cron Triggers
```

确认有这一条：

```text
* * * * *
```

> Cron 首次生效可能有几分钟延迟，不是保存后立刻执行。

---

## 13. 部署 Worker

如果你是 GitHub 集成部署：

1. 回到项目 Deployments / 部署页面。
2. 点击 Retry deployment / Redeploy / 重新部署。
3. 等待构建完成。

如果你是本地命令部署：

```bash
npm install
npm run typecheck
npm test
npm run build:upload
npx wrangler deploy
```

本地部署也不需要改 `database_id`；如果 Wrangler 自动创建了 D1，部署后确认 Worker 里有 `DB` binding。你也可以在 Cloudflare 后台手动绑定已有 D1 数据库。

部署成功后会得到类似：

```text
https://linode-guard-lite.<你的子域>.workers.dev
```

后面统一叫：

```text
<你的Worker地址>
```

---

## 14. 测试 Worker 是否活着

浏览器打开：

```text
https://<你的Worker地址>/api/v1/health
```

或者命令行：

```bash
curl https://<你的Worker地址>/api/v1/health
```

预期能看到 JSON，并且包含类似：

```json
{
  "ok": true
}
```

如果这个都打不开，先不要继续设置 Telegram。

---

## 15. 设置 Telegram Webhook

### 15.1 准备两个值

你需要：

- `TELEGRAM_BOT_TOKEN`：BotFather 给你的 token。
- `TELEGRAM_WEBHOOK_SECRET`：初始化结果里生成的值，或你手动设置的 Worker Secret。

### 15.2 设置 webhook

把下面命令里的占位符换成你的真实值：

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<你的Worker地址>/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

成功会返回类似：

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### 15.3 检查 webhook

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

确认：

- `url` 是 `https://<你的Worker地址>/telegram/webhook`
- 没有明显 `last_error_message`

---

## 16. 初始化系统默认数据

部署后第一次需要初始化 settings、jobs、管理员保活默认记录。

### 方式 A：Telegram 初始化

在 Telegram 里找到你的 Bot，发送：

```text
/setup
```

如果你是已绑定的 Super Admin，Bot 会返回部署检查和初始化入口；未手动设置 `SUPER_ADMIN_TELEGRAM_ID` 时，首次 Telegram 消息会自动绑定。

### 方式 B：HTTP API 初始化

```bash
curl -X POST \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  https://<你的Worker地址>/api/v1/setup/initialize
```

---

## 17. 上线自检

### 17.1 检查部署状态

```bash
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  https://<你的Worker地址>/api/v1/diagnostics/deployment
```

重点看：

- D1 binding 是否正常。
- 数据表是否存在。
- Secrets 是否配置。
- 加密密钥是否正常。

### 17.2 检查 jobs

```bash
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  https://<你的Worker地址>/api/v1/diagnostics/jobs
```

重点看：

- `schedule_power` 是否存在并 enabled。
- `checkin_monitor` 是否存在并 enabled。
- 不要缺 jobs。

---

## 18. 添加第一个 Linode 账号

强烈建议先用测试 Linode Token。

### 方式 A：Telegram 添加

在 Telegram 里：

1. 发送 `/start`
2. 点击账号管理
3. 点击添加账号
4. 按提示输入 alias
5. 按提示输入 Linode Token

### 方式 B：HTTP API 添加

```bash
curl -X POST \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  https://<你的Worker地址>/api/v1/accounts \
  -d '{
    "alias": "test",
    "token": "<LINODE_TOKEN>"
  }'
```

安全说明：

- API 响应不会返回 Linode Token 明文。
- API 响应不会返回 `encrypted_token`。
- D1 里保存的是 encrypted token。
- Telegram 不应该继续展示 token 明文。

---

## 19. 首次试运行顺序

建议按这个顺序来，不要跳步：

1. 打开 `/api/v1/health`。
2. 调用 `/api/v1/diagnostics/deployment`。
3. 调用 `/api/v1/diagnostics/jobs`。
4. Telegram 发送 `/start`。
5. 添加测试 Linode 账号。
6. 查看实例列表。
7. 只对测试实例尝试 boot / shutdown。
8. 测试定时任务时，只使用 `boot` 或 `shutdown`。
9. 管理员保活策略先只配置 `notify`。
10. 确认一切正常后，再考虑更高风险动作。

不要首次就测试：

- delete 单实例删除
- batch delete 批量删除
- `delete_all_instances`
- 生产账号全量实例操作

---

## 20. 常见错误排查

### 20.1 Worker 打不开

检查：

- Workers & Pages 里的最新 deployment 是否成功。
- Build command 是否失败。
- Deploy command 是否是 `npx wrangler deploy`。
- 仓库根目录是否正确。

### 20.2 Missing D1 binding DB

原因：D1 binding 没有设置，或者变量名不是 `DB`。

处理：

```text
Workers & Pages → linode-guard-lite → Settings → Bindings
```

确认有：

- Type：D1 database
- Variable name：`DB`
- Database：`linode-guard-lite`

### 20.3 数据表缺失

原因：D1 创建了，但没有初始化表结构。

新部署处理：

1. 打开 Worker `/setup` 页面，点击初始化数据库表结构；或
2. 在 D1 SQL Console / Wrangler 中执行 `schema.sql` 或 `migrations/0001_initial.sql`。

新部署不要继续执行 `migrations/0002_legacy_group_compat.sql`、`0003_power_schedules_group_scope.sql`、`0004_power_schedules_instance_scope.sql`、`0005_job_locks.sql`、`0006_bot_managed_instances.sql`，因为 `0001` 已包含当前完整表结构。

旧部署处理：先做 schema inspect，再决定是否执行 legacy migration。`ALTER TABLE ADD COLUMN` 不能重复执行，已有列时再次执行会失败。

### 20.4 API 返回 UNAUTHORIZED

原因：没有带 Bearer Token，或 `API_AUTH_TOKEN` 填错。

请求必须带：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

### 20.5 Telegram Webhook 不生效

检查 webhook：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

确认：

- URL 是 `https://<你的Worker地址>/telegram/webhook`
- `secret_token` 和初始化生成或手动设置的 `TELEGRAM_WEBHOOK_SECRET` 一致
- 如果手动设置了 `SUPER_ADMIN_TELEGRAM_ID`，确认它和你的 Telegram 数字 ID 一致

### 20.6 Cron 没执行

检查：

```text
Workers & Pages → linode-guard-lite → Settings → Triggers → Cron Triggers
```

确认有：

```text
* * * * *
```

另外：

- Cron 可能延迟几分钟。
- `/api/v1/diagnostics/jobs` 里 jobs 要存在且 enabled。
- D1 的 `job_runs` 表里后续应该有运行记录。

### 20.7 Linode API 权限不足

如果出现权限错误：

- 检查 Linode Token 权限。
- 至少需要读取实例权限。
- 开机 / 关机 / 重启 / 删除需要对应写权限。
- 先用测试账号，不要直接用生产账号。

---

## 21. 以后怎么更新

你以后修改 GitHub fork 后：

```text
git push 到 main
```

Cloudflare Git 集成会自动重新部署，或者你可以在 Cloudflare 的 Deployments 页面手动点 Redeploy。

如果以后 schema 有变化，需要进入 D1 SQL Console 执行新的 migration。不要重复乱执行不确定的 SQL。

---

## 22. 最小配置清单

部署前确认这些都完成：

- GitHub 已 fork 项目。
- Cloudflare 已连接你的 fork。
- D1 database 已创建：`linode-guard-lite`。
- Worker D1 binding 已设置，变量名必须是 `DB`。
- D1 schema 已执行，或已通过 `/setup` 页面初始化。
- 普通变量默认已在 `wrangler.toml` 设置，一般不用手动填：
  - `APP_TIMEZONE`
  - `BATCH_CONCURRENCY`
  - `OPERATION_LOG_RETENTION_DAYS`
  - `LOGIN_EVENT_RETENTION_DAYS`
- 最小必填 Secret：
  - `TELEGRAM_BOT_TOKEN`
- 首次 `/setup initialize` 后会生成并保存的 runtime secrets。安装页面默认不会展示这些值；如需查看 API token，请通过 Cloudflare Worker Secrets 或受控 D1 控制台处理，不要截图或发到聊天里。runtime secrets 包括：
  - `API_AUTH_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `LINODE_TOKEN_ENCRYPTION_KEY`
- `SUPER_ADMIN_TELEGRAM_ID` 可选；不设置时，首次 Telegram 消息会自动绑定。
- Cron Trigger 默认已在 `wrangler.toml` 设置：`* * * * *`
- `/api/v1/health` 正常。
- `/api/v1/diagnostics/deployment` 正常。
- `/api/v1/diagnostics/jobs` 正常。
- Telegram webhook 已设置。
- 已用 `/setup` 或 API 初始化默认数据。
