# Linode Guard Lite PRD 与技术架构设计文档

版本：MVP Design Draft  
项目名称：Linode Guard Lite  
定位：API-first 自托管 Linode / Akamai Cloud 轻量运维控制面  
运行环境：Cloudflare Workers  
默认前端：Telegram Bot  
核心存储：Cloudflare D1  
状态：设计阶段，尚未进入代码实现

---

## 目录

1. 产品定位
2. 产品目标
3. 核心原则
4. MVP 功能范围
5. 非 MVP / 暂不支持功能
6. 用户与权限模型
7. API-first 总体架构
8. Telegram 前端设计
9. HTTP API 设计
10. D1 数据库表结构
11. Linode Token 管理设计
12. 实例管理设计
13. 批量操作设计
14. 账号安全事件监控设计
15. 管理员保活确认设计
16. 定时开关机设计
17. 审计日志设计
18. 统一错误模型
19. Job Runner 设计
20. 一键 setup wizard 设计
21. 部署自检接口设计
22. 开源部署文档结构
23. 环境变量 / Secrets 清单
24. 日志与数据保留
25. 风险说明
26. MVP 实施计划
27. MVP 验收标准
28. 新会话交接提示词

---

# 1. 产品定位

## 1.1 项目名称

Linode Guard Lite

## 1.2 一句话定位

Linode Guard Lite 是一个 API-first 的自托管 Linode / Akamai Cloud 轻量运维控制面，运行在 Cloudflare Workers 上。

它不是一个单纯 Telegram Bot，而是一个运行在 Cloudflare 上的轻量云运维控制面。

Telegram 只是默认前端入口之一，所有核心能力必须通过标准 HTTP API 暴露，方便未来扩展：

- Web 管理面板
- CLI 工具
- 第三方 webhook
- 手机快捷指令
- 自动化脚本
- 未来 App

## 1.3 产品形态

第一版只实现：

- Core HTTP API
- Telegram 默认入口
- Cloudflare Cron Job Runner
- Cloudflare D1 存储

Cloudflare Pages 暂不作为核心依赖。

未来可以增加 Web 管理面板，但不能让 Web UI 反过来主导核心架构。

---

# 2. 产品目标

Linode Guard Lite 面向个人开发者、小团队、自托管用户，目标是提供一个：

- 轻量
- 私密
- 低成本
- 易部署
- 易理解
- 易扩展
- 适合个人或小团队运维

的 Linode / Akamai Cloud 控制面。

## 2.1 解决的问题

- 临时 Linode 机器忘记关机，一直扣费
- Linode 控制台登录异常没有及时发现
- 管理员长期未确认，服务器仍持续运行
- 希望用 Telegram 快速操作，但不希望系统能力绑死在 Bot 命令里
- 希望未来可以通过 API 接入自动化、CLI、Webhook、手机快捷指令
- 不想部署复杂的运维平台

---

# 3. 核心原则

## 3.1 API-first

不要把能力绑死在 Telegram 命令里。

系统结构应为：

```text
Core HTTP API
→ Service Layer
→ Linode API / D1 / KV / Telegram / Cron
→ Frontends
```

Frontends 包括：

- Telegram Bot
- Web 管理面板，未来
- CLI，未来
- 手机快捷指令
- 第三方 webhook
- 自动化脚本
- App，未来

Telegram 只是调用 Service Layer 的一个前端适配器。

## 3.2 Telegram 不堆命令

Telegram 端不要设计成大量命令。

只保留少量入口命令：

- `/start`：打开主菜单
- `/setup`：部署 / 初始化向导
- `/cancel`：取消当前流程
- `/help`：帮助

其他功能通过 Telegram inline keyboard 按钮完成。

## 3.3 开源自部署优先

项目面向开源自部署用户。

不要写入个人本地配置。

第一版需要提供：

- `README.md`
- `docs/deployment/cloudflare.md`
- `docs/api.md`
- `docs/telegram.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `wrangler.toml.example`
- `schema.sql`
- `.env.example` 或 `secrets.example.md`

## 3.4 安全默认值清晰

第一版不做复杂多用户系统，但必须保证：

- 只有 Super Admin 可以使用 Telegram Bot
- HTTP API 使用独立 API Token
- Telegram Webhook 使用 secret token 校验
- Linode Token 加密后存 D1
- 不记录 Token 明文
- 危险操作写入审计日志

---

# 4. MVP 功能范围

## 4.1 部署与初始化

MVP 支持：

- Cloudflare Workers 部署
- Cloudflare D1 数据库绑定
- Telegram Webhook 接入
- `/setup` 初始化向导
- 部署自检 API
- Job Runner 自检 API
- 默认 settings 初始化
- 默认 jobs 初始化

## 4.2 认证与权限

MVP 支持：

- 单 Super Admin Telegram 用户
- Telegram 用户 ID 校验
- HTTP API Bearer Token 校验
- Telegram Webhook Secret 校验
- Worker Secrets 管理敏感配置

## 4.3 Linode 账号管理

MVP 支持：

- 多个 Linode 账号
- 每个账号对应一个 Linode API Token
- 每个账号必须有别名，例如 `default`、`production`、`backup`
- Token 验证
- Token 加密保存到 D1
- Token fingerprint 保存
- 删除账号 / 标记删除
- 测试账号 Token
- 查看账号列表

## 4.4 实例管理

MVP 支持：

- 查看账号列表
- 查看单账号服务器
- 查看所有账号服务器
- 查看实例详情
- 单台开机
- 单台关机
- 单台重启
- 单台删除

## 4.5 批量操作

MVP 支持：

- 单账号批量开机
- 单账号批量关机
- 单账号批量删除
- 所有账号批量开机
- 所有账号批量关机
- 所有账号批量删除

批量操作规则：

- 并发执行
- 默认并发上限 `BATCH_CONCURRENCY=5`
- 遇到失败继续执行
- 最后返回汇总
- 失败详情要展示
- 成功详情过多时 Telegram 可截断
- 所有批量操作写审计日志

## 4.6 账号安全事件监控

产品名称：账号安全事件监控  
英文：Account Security Event Monitor

MVP 主要数据源：

```http
GET /account/logins
```

它监控的是 Linode / Akamai Cloud 控制台账号登录事件，不是 SSH 登录监控，不是服务器内部登录监控。

MVP 支持事件：

- Linode 控制台登录成功
- Linode 控制台登录失败
- API token 权限异常
- Token 失效
- 异常 IP 登录
- 新登录地理位置变化，预留
- 多次失败登录
- 登录后未确认超时
- 夜间登录
- 国家 / 地区策略违规，预留

## 4.7 管理员保活确认

产品名称：管理员保活确认  
菜单短名：保活确认

一句话解释：

```text
管理员保活确认 = 你定期告诉系统：我还在，这些机器继续保留；如果太久没确认，系统就按预设策略提醒、关机或删除。
```

MVP 支持：

- 手动保活确认
- 查看最近确认时间
- 创建保活策略组
- 启用 / 停用策略组
- 删除策略组
- 自定义未确认时间阈值
- 自定义动作

策略动作：

- 提醒 Super Admin
- 关闭所有账号全部服务器
- 删除所有账号全部服务器

策略作用范围：MVP 只支持所有账号全部服务器。

## 4.8 定时开关机

MVP 支持：

- 单账号批量定时开机
- 单账号批量定时关机
- 所有账号批量定时开机
- 所有账号批量定时关机

MVP 不支持定时删除服务器。

## 4.9 审计日志

所有高风险操作写入 `audit_logs`：

- 删除实例
- 批量删除
- 删除账号 Token
- 管理员保活策略触发动作
- 定时任务执行
- 登录安全事件处理
- 系统诊断关键失败

## 4.10 Job Runner

Cloudflare Cron 每 1 分钟触发一次。

统一 Job Runner 负责：

- `login_monitor`
- `login_timeout`
- `checkin_monitor`
- `schedule_power`
- `message_cleanup`
- `audit_log_cleanup`
- `security_event_cleanup`

---

# 5. 非 MVP / 暂不支持功能

第一版明确不支持：

## 5.1 权限与用户体系

- 多个 Telegram 管理员
- 只读用户
- 管理员 / 只读角色系统
- 多租户
- OAuth 登录
- Web UI 登录体系

## 5.2 Telegram 高级能力

- 大量 Telegram 命令
- Telegram 群组多管理员协作
- Telegram 审批流
- 删除前二次确认

## 5.3 实例保护能力

MVP 不支持：

- Protected Instance
- 删除保护开关
- 删除前二次确认
- 标签级保护
- 基于实例名称的保护规则

但统一错误码可以预留：

- `PROTECTED_INSTANCE`
- `CONFIRMATION_REQUIRED`
- `CONFIRMATION_EXPIRED`

## 5.4 保活策略高级范围

MVP 不支持：

- 指定单台服务器
- 指定某个账号
- 指定标签
- 指定实例组

## 5.5 定时删除

MVP 不支持定时删除服务器。

删除能力只存在于：

- 手动按钮删除单台服务器
- 手动按钮批量删除单账号服务器
- 手动按钮批量删除所有账号服务器
- 管理员保活确认策略自动删除所有账号全部服务器

## 5.6 完整 IP Geo

MVP 如果没有 IP Geo API：

- 只记录 IP
- 地理位置显示未知
- 国家 / 地区策略作为可选扩展

注意：Cloudflare 请求地理信息是访问 Bot/API 的用户 IP，不是 Linode 登录事件 IP，不能直接用来判断 Linode 登录地理位置。

## 5.7 Web 管理面板

MVP 不依赖 Cloudflare Pages。第一版只做 Core API 和 Telegram 默认入口。

---

# 6. 用户与权限模型

## 6.1 Super Admin

第一版只支持一个 Super Admin。

通过 Worker Secret / 环境变量配置：

```text
SUPER_ADMIN_TELEGRAM_ID=123456789
```

规则：

- 只有 Super Admin 可以使用 Telegram Bot
- 非 Super Admin 访问 Bot 时直接拒绝
- 所有危险操作只允许 Super Admin 执行
- HTTP API 使用独立 API Token 认证

## 6.2 HTTP API 认证

第一版使用 Bearer Token：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

`API_AUTH_TOKEN` 存 Worker Secret。

API 路径：

```text
/api/v1/...
```

## 6.3 Telegram Webhook 认证

Telegram Webhook 路径：

```text
/telegram/webhook
```

使用 secret token 校验：

```text
TELEGRAM_WEBHOOK_SECRET=xxxxx
```

请求头：

```http
X-Telegram-Bot-Api-Secret-Token: xxxxx
```

## 6.4 Actor 模型

审计日志和服务上下文中统一使用 actor：

```text
telegram:123456789
api:default
cron:job_runner
setup:telegram
```

source：

```text
telegram
api
cron
setup
```

---

# 7. API-first 总体架构

## 7.1 架构图

```text
                    ┌────────────────────────┐
                    │       Frontends        │
                    │  Telegram Bot          │
                    │  Web UI, future        │
                    │  CLI, future           │
                    │  Webhooks, future      │
                    │  Mobile Shortcuts      │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │    Cloudflare Worker   │
                    │  HTTP Router           │
                    │  Auth Middleware       │
                    │  Request Context       │
                    │  Error Mapper          │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │     Core API Layer     │
                    │  /api/v1/...           │
                    │  /telegram/webhook     │
                    │  Cron Entry            │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │     Service Layer      │
                    │  AccountService        │
                    │  InstanceService       │
                    │  BatchService          │
                    │  SecurityService       │
                    │  AdminPresenceService  │
                    │  ScheduleService       │
                    │  JobRunnerService      │
                    │  AuditService          │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ Linode API      │ │ Cloudflare D1   │ │ Telegram API   │
     │ Instances       │ │ Accounts       │ │ Push Messages   │
     │ Logins          │ │ Events         │ │ Delete Messages │
     │ Account Test    │ │ Jobs           │ │ Inline Keyboard │
     └────────────────┘ └────────────────┘ └────────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Optional Cloudflare KV │
                    │ Cache / Rate State     │
                    │ Future lightweight use │
                    └────────────────────────┘
```

## 7.2 Worker 入口

Worker 有三个主要入口：

1. Core HTTP API：`/api/v1/...`，认证 `Authorization: Bearer <API_AUTH_TOKEN>`
2. Telegram Webhook：`/telegram/webhook`，校验 `X-Telegram-Bot-Api-Secret-Token`，并校验 `from.id == SUPER_ADMIN_TELEGRAM_ID`
3. Cloudflare Cron Trigger：建议每分钟触发一次，用于统一唤醒 Job Runner；各 Job 通过 `jobs.next_run_at` 控制实际执行频率。

## 7.3 推荐模块

```text
src/
  index.ts
  router.ts
  env.ts
  middleware/
    auth.ts
    request-context.ts
    error-handler.ts
  api/
    health.ts
    diagnostics.ts
    accounts.ts
    instances.ts
    batch.ts
    security.ts
    admin-presence.ts
    schedules.ts
    audit-logs.ts
  telegram/
    webhook.ts
    commands.ts
    menus.ts
    callbacks.ts
    sessions.ts
    renderers.ts
  services/
    account-service.ts
    instance-service.ts
    batch-service.ts
    security-service.ts
    admin-presence-service.ts
    schedule-service.ts
    job-runner-service.ts
    audit-service.ts
    setup-service.ts
  clients/
    linode-client.ts
    telegram-client.ts
  storage/
    db.ts
    settings-repository.ts
    accounts-repository.ts
    events-repository.ts
    audit-repository.ts
    jobs-repository.ts
  crypto/
    token-crypto.ts
    fingerprint.ts
  errors/
    error-codes.ts
    app-error.ts
    error-mapper.ts
    telegram-error-messages.ts
  utils/
    time.ts
    cron.ts
    pagination.ts
    sanitize.ts
    ids.ts
```

---

# 8. Telegram 前端设计

## 8.1 命令

只保留：

```text
/start
/setup
/cancel
/help
```

## 8.2 `/start`

功能：

- 校验 Super Admin
- 展示主菜单
- 若未配置完成，提示执行 `/setup`
- 若无 Linode 账号，提示添加账号

## 8.3 `/setup`

功能：

- 部署 / 初始化向导
- 检查环境变量
- 检查 D1 binding
- 检查表结构
- 检查 Telegram webhook
- 检查消息发送
- 检查 Super Admin
- 检查 Token 加密密钥
- 检查 Webhook Secret

## 8.4 `/cancel`

功能：清除当前用户 `bot_sessions`，取消添加 Token、创建策略、创建定时任务等流程。

回复示例：

```text
已取消当前操作。
```

## 8.5 `/help`

回复示例：

```text
Linode Guard Lite 是一个 API-first 的轻量 Linode 运维控制面。

常用入口：
/start 打开主菜单
/setup 部署/初始化向导
/cancel 取消当前流程
/help 查看帮助

所有核心能力也可以通过 /api/v1/... HTTP API 使用。
```

## 8.6 主菜单

主菜单需要显示：账号数、服务器数、最近保活确认时间、账号安全监控状态、定时任务状态、保活策略组状态。

示例：

```text
🛡 Linode Guard Lite

账号数：3
服务器数：8

最近确认：2026-xx-xx 10:00
账号安全监控：开启
定时任务：2 个启用
保活策略组：1 个启用

[账号管理] [服务器管理]
[批量操作]
[账号安全事件] [管理员保活确认]
[定时任务] [审计日志]
[系统自检] [设置]
```

如果没有确认记录：`最近确认：从未确认`。如果没有账号：`账号数：0`、`服务器数：-`。

## 8.7 账号管理菜单

示例：

```text
账号管理

账号数：3

#1 default
状态：正常
Token：fp_abcd1234

#2 production
状态：正常
Token：fp_efgh5678

[添加账号]
[刷新账号列表]
[返回主菜单]
```

单账号按钮：

```text
[查看服务器] [测试 Token]
[删除账号]
```

## 8.8 添加账号流程

```text
1. 用户点击 [添加账号]
2. Bot 询问账号别名
3. 用户发送别名，例如 default
4. Bot 询问 Linode API Token
5. 用户发送 Token
6. Bot 验证 Token
7. Token 加密保存 D1
8. Bot 尝试删除用户 Token 消息
9. Bot 返回保存结果
```

安全要求：Bot 不回显 Token；日志不记录 Token 明文；D1 不保存 Token 明文；删除 Token 消息失败不能影响保存流程；删除失败要记录脱敏日志；可以记录 `token_fingerprint`。

## 8.9 服务器管理菜单

```text
服务器管理

[查看全部服务器]
[选择账号]
[返回主菜单]
```

实例列表：

```text
服务器列表

账号：default

#123456 web-1
状态：running
区域：jp-osa
规格：g6-standard-1

[详情] [开机] [关机]
[重启] [删除]
```

## 8.10 批量操作菜单

```text
批量操作

[单账号批量开机]
[单账号批量关机]
[单账号批量删除]

[全部账号批量开机]
[全部账号批量关机]
[全部账号批量删除]

[返回主菜单]
```

批量删除风险提示：

```text
⚠️ 高风险操作

你正在执行：删除全部账号全部服务器

MVP 当前不会进行二次确认。
点击按钮后将立即执行。

[执行删除]
[返回]
```

注意：可以展示风险提示，但不做二次确认流程。

## 8.11 账号安全事件菜单

```text
账号安全事件

监控状态：开启
最近检查：2 分钟前
未确认登录事件：1
最近事件：5

[查看未确认事件]
[查看全部事件]
[安全策略设置]
[手动检查]
[返回主菜单]
```

安全事件推送：

```text
🛡 账号安全事件

类型：控制台登录成功
账号：#1 default
用户：example@example.com
IP：203.0.113.10
地区：未知
时间：2026-xx-xx 10:00

[是我] [不是我] [查看账号]
```

登录未确认超时推送：

```text
⚠️ 登录事件未确认超时

账号：#1 default
IP：203.0.113.10
登录时间：2026-xx-xx 10:00
超过 30 分钟未确认。

[查看事件] [查看账号]
```

## 8.12 管理员保活确认菜单

```text
管理员保活确认

最近确认：2026-xx-xx 10:00
当前周期：cycle_abc123

启用策略组：1

[我还在，继续保留]
[查看策略组]
[创建策略组]
[返回主菜单]
```

确认后：

```text
✅ 保活确认成功

确认时间：2026-xx-xx 10:00
新的保活周期已开始。
```

策略组示例：

```text
策略组：临时机器保险
状态：启用

规则：
12 小时未确认 → 提醒 Super Admin
24 小时未确认 → 删除所有账号全部服务器

[启用/停用]
[删除策略组]
[返回]
```

## 8.13 定时任务菜单

```text
定时任务

默认时区：Asia/Shanghai
启用任务：2

#1 每天 09:00 开机所有账号服务器
#2 每天 23:00 关机所有账号服务器

[创建定时任务]
[查看任务]
[返回主菜单]
```

## 8.14 审计日志菜单

```text
审计日志

默认保留：1 天

[最近 20 条]
[高风险操作]
[返回主菜单]
```

## 8.15 系统自检菜单

调用：

```http
GET /api/v1/diagnostics/deployment
GET /api/v1/diagnostics/jobs
```

展示：

```text
系统自检

✅ D1 Binding DB
✅ 数据表结构
✅ Telegram Bot Token
✅ Webhook Secret
✅ Token 加密密钥
✅ Super Admin
✅ Telegram Webhook
✅ 测试消息发送

系统状态：可用
```

---

# 9. HTTP API 设计

## 9.1 通用规则

Base path：`/api/v1`

认证：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

成功响应：

```json
{
  "ok": true,
  "data": {}
}
```

失败响应：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "request_id": "req_abc123"
  }
}
```

建议所有 API 响应带：`X-Request-Id: req_abc123`。

## 9.2 Health / Diagnostics

### GET `/api/v1/health`

用途：简单健康检查，不暴露敏感信息。

响应：

```json
{
  "ok": true,
  "data": {
    "service": "linode-guard-lite",
    "version": "0.1.0",
    "time": "2026-xx-xxT10:00:00.000Z"
  }
}
```

### GET `/api/v1/diagnostics/deployment`

用途：部署自检，`/setup` 复用该能力。

响应：

```json
{
  "ok": true,
  "data": {
    "checks": {
      "db": { "ok": true },
      "telegram_token": { "ok": true },
      "webhook_secret": { "ok": true },
      "encryption_key": { "ok": true },
      "super_admin": { "ok": true },
      "tables": { "ok": true, "missing": [] },
      "webhook": { "ok": true }
    }
  }
}
```

### GET `/api/v1/diagnostics/jobs`

用途：查看 Job Runner 状态。

响应：

```json
{
  "ok": true,
  "data": {
    "jobs": [
      {
        "name": "login_monitor",
        "enabled": true,
        "last_run_at": "2026-xx-xxT10:00:00.000Z",
        "last_status": "success",
        "summary": "发现 0 个新事件"
      }
    ]
  }
}
```

## 9.3 Accounts

### GET `/api/v1/accounts`

返回账号列表，不返回 Token 明文。

### POST `/api/v1/accounts`

请求：

```json
{
  "alias": "default",
  "token": "linode-api-token"
}
```

行为：校验 alias；验证 Token；加密保存 Token；保存 fingerprint；写审计日志。

### DELETE `/api/v1/accounts/:account_id`

删除或标记账号为 deleted，不返回 Token，写审计日志。

### POST `/api/v1/accounts/:account_id/test`

解密 Token，调用 Linode API 测试，更新 token_status。

## 9.4 Instances

```http
GET /api/v1/instances
GET /api/v1/accounts/:account_id/instances
GET /api/v1/accounts/:account_id/instances/:instance_id
POST /api/v1/accounts/:account_id/instances/:instance_id/boot
POST /api/v1/accounts/:account_id/instances/:instance_id/shutdown
POST /api/v1/accounts/:account_id/instances/:instance_id/reboot
DELETE /api/v1/accounts/:account_id/instances/:instance_id
```

删除实例规则：默认允许删除；不二次确认；写审计日志；风险等级 high。

## 9.5 Batch Operations

单账号批量操作：

```http
POST /api/v1/batch/accounts/:account_id/instances/boot
POST /api/v1/batch/accounts/:account_id/instances/shutdown
POST /api/v1/batch/accounts/:account_id/instances/delete
```

全账号批量操作：

```http
POST /api/v1/batch/all/instances/boot
POST /api/v1/batch/all/instances/shutdown
POST /api/v1/batch/all/instances/delete
```

当前批量操作默认操作范围内全部实例；MVP 不支持指定单台服务器、标签或实例组筛选。

## 9.6 Security Events

```http
GET /api/v1/security/events
GET /api/v1/security/settings
PUT /api/v1/security/settings
POST /api/v1/security/events/:event_id/confirm
```

事件查询参数：`status`、`type`、`account_id`、`limit`、`cursor`。

确认请求：

```json
{
  "result": "me"
}
```

或：

```json
{
  "result": "not_me"
}
```

## 9.7 Admin Presence

```http
GET /api/v1/admin-presence/status
POST /api/v1/admin-presence/checkin
GET /api/v1/admin-presence/policies
POST /api/v1/admin-presence/policies
PUT /api/v1/admin-presence/policies/:policy_id
DELETE /api/v1/admin-presence/policies/:policy_id
```

创建策略请求示例：

```json
{
  "name": "临时机器保险",
  "enabled": true,
  "rules": [
    { "after_minutes": 720, "action": "notify" },
    { "after_minutes": 1440, "action": "delete_all_instances" }
  ]
}
```

## 9.8 Schedules

```http
GET /api/v1/schedules
POST /api/v1/schedules
PUT /api/v1/schedules/:schedule_id
DELETE /api/v1/schedules/:schedule_id
POST /api/v1/schedules/:schedule_id/enable
POST /api/v1/schedules/:schedule_id/disable
```

创建任务请求示例：

```json
{
  "name": "每天晚上关机",
  "enabled": true,
  "action": "shutdown",
  "scope": "all",
  "account_id": null,
  "cron_expr": "0 23 * * *",
  "timezone": "Asia/Shanghai"
}
```

MVP 支持 action：`boot`、`shutdown`。不支持 `delete`。

## 9.9 Audit Logs

```http
GET /api/v1/audit-logs
```

查询参数：`risk_level`、`action`、`source`、`limit`、`cursor`。

## 9.10 Telegram Webhook

```http
POST /telegram/webhook
```

用途：Telegram update 入口，不作为核心业务 API，内部解析后调用 Service Layer。

校验：`X-Telegram-Bot-Api-Secret-Token`。

---

# 10. D1 数据库表结构

以下 schema 可直接整理为 `schema.sql`。

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS linode_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  token_fingerprint TEXT NOT NULL,
  token_status TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_login_id TEXT,
  last_login_check_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_linode_accounts_status ON linode_accounts(status);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  linode_login_id TEXT NOT NULL,
  username TEXT,
  ip TEXT,
  datetime TEXT NOT NULL,
  status TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_events_account_linode_id ON login_events(account_id, linode_login_id);
CREATE INDEX IF NOT EXISTS idx_login_events_datetime ON login_events(datetime);
CREATE INDEX IF NOT EXISTS idx_login_events_created_at ON login_events(created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  login_event_id INTEGER,
  linode_login_id TEXT,
  username TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  occurred_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  confirmation_result TEXT,
  message_sent_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id),
  FOREIGN KEY(login_event_id) REFERENCES login_events(id)
);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(status);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type);
CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_id);
CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at ON security_events(occurred_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  risk_level TEXT NOT NULL,
  result TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS admin_presence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_checkin_at TEXT,
  last_checkin_actor TEXT,
  current_cycle_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_presence_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'all',
  rules_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_presence_policies_enabled ON admin_presence_policies(enabled);

CREATE TABLE IF NOT EXISTS admin_presence_policy_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary TEXT,
  error_code TEXT,
  metadata_json TEXT,
  FOREIGN KEY(policy_id) REFERENCES admin_presence_policies(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_policy_runs_unique_cycle_rule ON admin_presence_policy_runs(policy_id, rule_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_presence_policy_runs_triggered_at ON admin_presence_policy_runs(triggered_at);

CREATE TABLE IF NOT EXISTS power_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id INTEGER,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_power_schedules_enabled ON power_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_power_schedules_next_run_at ON power_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  summary TEXT,
  error_code TEXT,
  metadata_json TEXT,
  FOREIGN KEY(schedule_id) REFERENCES power_schedules(id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule_id ON schedule_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_started_at ON schedule_runs(started_at);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cron_expr TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  config_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  summary TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

CREATE TABLE IF NOT EXISTS bot_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  state TEXT NOT NULL,
  data_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user ON bot_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_expires_at ON bot_sessions(expires_at);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  delete_status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_delete_status ON telegram_messages(delete_status);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_created_at ON telegram_messages(created_at);
```

字段补充：

- `linode_accounts.status`: `active` / `deleted`
- `linode_accounts.token_status`: `unknown` / `valid` / `invalid` / `permission_error`
- `security_events.status`: `open` / `confirmed` / `closed` / `ignored`
- `security_events.confirmation_result`: `me` / `not_me`
- `security_events.severity`: `low` / `medium` / `high` / `critical`
- `admin_presence_policies.rules_json` action: `notify` / `shutdown_all_instances` / `delete_all_instances`
- `power_schedules.action`: `boot` / `shutdown`
- `power_schedules.scope`: `account` / `all`
- `job_runs.status`: `success` / `failed` / `partial` / `skipped`
- `bot_sessions.state`: `adding_account_alias` / `adding_account_token` / `creating_presence_policy` / `creating_power_schedule`
- `telegram_messages.purpose`: `linode_token` / `temporary_prompt`
- `telegram_messages.delete_status`: `pending` / `deleted` / `failed` / `skipped`

---

# 11. Linode Token 管理设计

支持多个 Linode 账号，每个账号对应一个 Linode API Token。

Token 添加方式：Telegram Bot 或 HTTP API。

Telegram 添加流程：

```text
1. 用户点击添加账号或通过引导流程开始
2. 必须指定账号别名，例如 default / production / backup
3. Bot 提示用户发送 Linode API Token
4. 用户发送 Token
5. Bot 验证 Token
6. Token 加密后保存到 D1
7. Bot 删除用户刚刚发送的 Token 消息
8. Bot 返回保存结果
```

安全要求：

- Linode Token 加密后存 D1
- 加密密钥存 Worker Secret
- 不把动态添加的 Linode Token 存 Worker 环境变量
- Bot 回复不回显 Token
- 日志不记录 Token 明文
- 用户发送 Token 的 Telegram 消息保存后必须立即删除
- 删除 Token 消息失败不能影响 Token 保存流程，但要记录日志
- 日志中不能包含 Token 原文
- 可以记录 `token_fingerprint`

推荐 Worker Secret：

```text
LINODE_TOKEN_ENCRYPTION_KEY=your-secret-key
```

加密建议：Web Crypto API、AES-GCM、每个 Token 使用独立随机 IV、保存格式 `v1:<base64_iv>:<base64_ciphertext>`。

Token fingerprint 建议：使用 SHA-256，保存前 12 位，格式示例 `fp_abcd1234ef56`。不能保存 Token 明文。

---

# 12. 实例管理设计

支持能力：

- 查看所有账号服务器
- 查看单账号服务器
- 查看实例详情
- 单台开机
- 单台关机
- 单台重启
- 单台删除

Linode API 调用：

```http
GET /linode/instances
GET /linode/instances/:id
POST /linode/instances/:id/boot
POST /linode/instances/:id/shutdown
POST /linode/instances/:id/reboot
DELETE /linode/instances/:id
```

删除规则：

- 默认允许删除
- 删除前不需要二次确认
- 不做增强保护
- 不做 protected instance
- 删除后必须返回结果通知
- 删除操作必须写入审计日志
- 只允许 Super Admin 或已认证 API 执行

---

# 13. 批量操作设计

批量操作适用：

- 单账号批量开机
- 单账号批量关机
- 单账号批量删除
- 所有账号批量开机
- 所有账号批量关机
- 所有账号批量删除
- 管理员保活确认策略触发的全局关机 / 删除
- 定时任务触发的批量开机 / 关机

默认并发：`BATCH_CONCURRENCY=5`。

规则：批量操作做并发；遇到失败继续执行；最后返回汇总；失败详情要展示；成功详情过多时可以截断；所有批量操作写审计日志。

Service 返回模型：

```json
{
  "action": "delete",
  "scope": "all",
  "total": 8,
  "success": 7,
  "failed": 1,
  "items": [
    {
      "account_id": 1,
      "account_alias": "default",
      "instance_id": 123456,
      "label": "web-1",
      "result": "success"
    },
    {
      "account_id": 2,
      "account_alias": "production",
      "instance_id": 999999,
      "label": "db-1",
      "result": "failed",
      "error_code": "LINODE_API_ERROR",
      "message": "Linode API 请求失败"
    }
  ]
}
```

审计风险等级：

- 批量开机：medium
- 批量关机：medium
- 单账号批量删除：critical
- 所有账号批量删除：critical
- 保活策略自动删除所有实例：critical

---

# 14. 账号安全事件监控设计

产品名称：账号安全事件监控  
英文：Account Security Event Monitor

不要只叫“登录监控”。

MVP 数据源：

```http
GET /account/logins
```

它监控的是 Linode / Akamai Cloud 控制台账号登录事件，不是 SSH 登录监控，不是服务器内部登录监控。

安全事件类型：

```text
LOGIN_SUCCESS
LOGIN_FAILED
TOKEN_INVALID
TOKEN_PERMISSION_ERROR
SUSPICIOUS_IP
GEO_LOCATION_CHANGED
FAILED_LOGIN_THRESHOLD_EXCEEDED
NIGHT_LOGIN
LOGIN_UNCONFIRMED_TIMEOUT
COUNTRY_POLICY_VIOLATION
```

登录事件字段：登录事件 ID、username、IP、datetime、status、所属 Linode 账号、raw_json。

去重：使用 `(account_id, linode_login_id)` 唯一约束，同时在 `linode_accounts` 保存 `last_seen_login_id` 和 `last_login_check_at`，避免登录事件清理后重复推送旧事件。

默认保留：`LOGIN_EVENT_RETENTION_DAYS=1`。

安全策略配置存于 `settings.security_settings`：

```json
{
  "enabled": true,
  "ip_allowlist": ["203.0.113.10", "203.0.113.0/24"],
  "allowed_countries": ["CN", "JP", "SG", "US"],
  "blocked_countries": ["RU", "KP"],
  "failed_login_threshold": 3,
  "failed_login_window_minutes": 30,
  "night_login_enabled": true,
  "night_start": "00:00",
  "night_end": "06:00",
  "timezone": "Asia/Shanghai",
  "login_confirmation_timeout_minutes": 30
}
```

IP 白名单：如果登录 IP 不在白名单内，生成 `SUSPICIOUS_IP`。MVP 可先支持精确 IP，CIDR 后续增强。

国家 / 地区策略：如没有 IP Geo API，只记录 IP，地区显示未知。不能使用 Cloudflare 请求地理信息判断 Linode 登录 IP。

登录失败阈值：同账号、同用户名或同 IP，在窗口内失败次数达到阈值，生成 `FAILED_LOGIN_THRESHOLD_EXCEEDED`。

夜间登录提醒：登录成功事件发生时间转换到配置时区后落在夜间区间，生成 `NIGHT_LOGIN`。

登录确认推送：

```text
🛡 账号安全事件

类型：控制台登录成功
账号：#1 default
用户：xxx
IP：203.0.113.10
地区：Japan / Tokyo
时间：2026-xx-xx 10:00

[是我] [不是我] [查看账号]
```

未确认超时 Job：`login_timeout`。查询 `LOGIN_SUCCESS` 且 `status=open`，超过 `login_confirmation_timeout_minutes` 仍未确认，则生成 `LOGIN_UNCONFIRMED_TIMEOUT` 并推送 Telegram。

---

# 15. 管理员保活确认设计

产品名称：管理员保活确认。菜单短名：保活确认。不要叫“打卡存活”。

管理员保活确认用于定期确认 Super Admin 仍在维护这些服务器。它不是检测服务器是否在线，而是检测管理员是否还在管理这些机器。

典型场景：

- 防止临时 Linode 机器忘记关机一直扣费
- 防止人失联后机器一直跑
- 防止账号被盗后长期无人发现
- 给自己一个“每天确认一次”的运维保险

MVP 支持：

- 手动保活确认
- 查看最近确认时间
- 创建保活策略组
- 启用 / 停用策略组
- 删除策略组
- 自定义未确认时间阈值
- 自定义动作

策略作用范围：MVP 只支持所有账号全部服务器。

策略动作：

```text
notify
shutdown_all_instances
delete_all_instances
```

策略组示例：

```json
{
  "name": "临时机器保险",
  "enabled": true,
  "scope": "all",
  "rules": [
    {
      "rule_id": "notify_12h",
      "after_minutes": 720,
      "action": "notify"
    },
    {
      "rule_id": "delete_24h",
      "after_minutes": 1440,
      "action": "delete_all_instances"
    }
  ]
}
```

周期机制：`admin_presence.current_cycle_id` 表示当前保活周期。每次 Super Admin 手动确认：更新 `last_checkin_at`，更新 `last_checkin_actor`，生成新的 `current_cycle_id`，新周期内所有策略规则可以重新触发。

触发 Job：`checkin_monitor`。

触发规则：获取最近确认时间和当前周期 ID；查询启用策略组；遍历每条规则；判断未确认时间是否超过阈值；查询 `admin_presence_policy_runs`，确认当前周期内该规则未触发过；执行动作；记录策略运行；写审计日志；推送结果给 Super Admin。

限制：每个保活周期内，每条规则只触发一次；Super Admin 手动确认后重置周期；策略组不需要二次确认；策略触发后直接执行；执行后必须推送结果；执行后必须写审计日志。

创建高危策略时可提示风险，但执行时不做二次确认。

---

# 16. 定时开关机设计

MVP 支持：

- 单账号批量定时开机
- 单账号批量定时关机
- 所有账号批量定时开机
- 所有账号批量定时关机

不支持定时删除服务器。

默认时区：`APP_TIMEZONE=Asia/Shanghai`。每个 schedule 可单独保存 timezone。

`power_schedules` 保存：name、enabled、action、scope、account_id、cron_expr、timezone、last_run_at、next_run_at。

执行 Job：`schedule_power`。

执行逻辑：查询 enabled schedule；判断 `next_run_at <= now`；执行对应批量操作；写 `schedule_runs`；更新 `last_run_at`；计算下一次 `next_run_at`；写审计日志；推送结果给 Super Admin。

执行后通知示例：

```text
⏰ 定时任务执行完成

任务：每天晚上关机
动作：关闭所有账号服务器
范围：所有账号

总数：8
成功：7
失败：1

失败详情：
#123456 web-1：LINODE_API_ERROR
```

---

# 17. 审计日志设计

表名：`audit_logs`。

字段：`id`、`request_id`、`actor`、`source`、`action`、`target_type`、`target_id`、`risk_level`、`result`、`error_code`、`created_at`、`metadata_json`。

actor 示例：

```text
telegram:123456789
api:default
cron:job_runner
setup:telegram
```

source：`telegram` / `api` / `cron` / `setup`。

risk_level：

- low：查看类、诊断类
- medium：开机 / 关机 / 重启 / 定时开关机
- high：删除单台实例、删除账号 Token
- critical：单账号批量删除、所有账号批量删除、保活策略触发删除所有实例

result：`success` / `failed` / `partial` / `skipped`。

默认保留时间：`OPERATION_LOG_RETENTION_DAYS=1`，由 `audit_log_cleanup` 清理。

---

# 18. 统一错误模型

所有底层错误都要转换成统一错误模型。Service Layer 不直接抛原始错误给上层。API 和 Telegram 共用同一套错误码。API 返回机器可读错误。Telegram 把错误翻译成人话。

API 成功响应：

```json
{
  "ok": true,
  "data": {}
}
```

API 失败响应：

```json
{
  "ok": false,
  "error": {
    "code": "DELETE_DISABLED",
    "message": "Delete is disabled by ALLOW_DELETE=false",
    "request_id": "req_abc123"
  }
}
```

内部建议：

```ts
type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

type AppError = {
  code: ErrorCode;
  message: string;
  request_id: string;
  status?: number;
  details?: unknown;
};
```

MVP 至少定义错误码：

```text
UNAUTHORIZED
FORBIDDEN
ACCOUNT_NOT_FOUND
INSTANCE_NOT_FOUND
DELETE_DISABLED
PROTECTED_INSTANCE
CONFIRMATION_REQUIRED
CONFIRMATION_EXPIRED
LINODE_API_ERROR
RATE_LIMITED
CONFIG_MISSING
TOKEN_INVALID
TOKEN_PERMISSION_ERROR
TELEGRAM_API_ERROR
D1_ERROR
WEBHOOK_SECRET_INVALID
SCHEDULE_NOT_FOUND
POLICY_NOT_FOUND
JOB_FAILED
VALIDATION_ERROR
```

Telegram 人话提示示例：

- `UNAUTHORIZED`：⛔️ 未授权访问。
- `FORBIDDEN`：⛔️ 你不是此 Bot 的 Super Admin，无法使用。
- `ACCOUNT_NOT_FOUND`：找不到这个 Linode 账号，可能已经被删除。
- `INSTANCE_NOT_FOUND`：找不到这台服务器，可能已经被删除或账号 Token 无权访问。
- `DELETE_DISABLED`：⛔️ 删除开关未开启，不能删除实例。
- `PROTECTED_INSTANCE`：⛔️ 该实例受到保护，不能删除。
- `CONFIRMATION_REQUIRED`：该操作需要确认后才能继续。
- `CONFIRMATION_EXPIRED`：确认已过期，请重新发起操作。
- `LINODE_API_ERROR`：Linode API 调用失败，请稍后重试或检查账号 Token 权限。
- `RATE_LIMITED`：请求过于频繁，已被限流，请稍后再试。
- `CONFIG_MISSING`：没有找到对应配置，请检查 Cloudflare Worker 配置。
- `TOKEN_INVALID`：Linode Token 无效，请检查后重新添加。
- `TOKEN_PERMISSION_ERROR`：Linode Token 权限不足，请确认 Token 具有读取账号、读取实例和管理实例的权限。
- `D1_ERROR`：数据库操作失败，请检查 D1 绑定和表结构。
- `VALIDATION_ERROR`：输入格式不正确，请检查后重试。

`CONFIG_MISSING` 示例：底层错误 `Missing D1 binding DB`，API 返回 `CONFIG_MISSING`，Telegram 展示：

```text
没有找到 D1 绑定 DB。
请在 Cloudflare Worker 中绑定 D1 数据库，并确认 binding 名称为 DB。
```

---

# 19. Job Runner 设计

Cloudflare Cron 不应该散乱地直接调用多个函数。统一 Job Runner 的好处：每个任务有独立运行记录；失败不会影响其他任务；可观察性更好；`/api/v1/diagnostics/jobs` 可展示状态；未来可以启停单个任务；方便排查 Cron 问题。

Cron 触发频率建议：

```text
* * * * *
```

MVP 内置 Job：

```text
login_monitor
login_timeout
checkin_monitor
schedule_power
message_cleanup
audit_log_cleanup
security_event_cleanup
```

Runner 执行流程：

```text
Cron Trigger
→ JobRunner.runDueJobs()
→ 查询 enabled jobs
→ 判断是否 due
→ 逐个执行 job
→ 每个 job 单独 try/catch
→ 写 job_runs
→ 更新 jobs.last_run_at / next_run_at
→ 汇总执行结果
```

Job 状态：`success` / `failed` / `partial` / `skipped`。

各 Job 职责：

- `login_monitor`：遍历 active Linode accounts，调用 `/account/logins`，保存新 login_events，生成 security_events，推送新安全事件，更新 account 游标。
- `login_timeout`：检查未确认登录成功事件，超过 timeout 生成 `LOGIN_UNCONFIRMED_TIMEOUT` 并推送 Telegram。
- `checkin_monitor`：检查管理员保活策略，每周期每规则只触发一次，执行 notify / shutdown_all / delete_all，写策略运行记录、审计日志并推送结果。
- `schedule_power`：查询到期 power_schedules，执行批量开机 / 关机，写 schedule_runs、audit_logs 并推送结果。
- `message_cleanup`：删除 `telegram_messages` 里 pending 的敏感消息，清理过期 bot_sessions，删除失败不影响业务。
- `audit_log_cleanup`：按 `OPERATION_LOG_RETENTION_DAYS` 清理 audit_logs。
- `security_event_cleanup`：按 `LOGIN_EVENT_RETENTION_DAYS` 清理 login_events，可清理较早已关闭 security_events，但不能破坏账号游标去重。

---

# 20. 一键 setup wizard 设计

`/setup` 是部署 / 初始化向导，不是普通业务命令。

目标：帮助开源自部署用户快速确认系统是否可用，把底层错误翻译成人话，给出下一步操作入口。

检查项：

- Telegram Bot Token
- Super Admin Telegram ID
- D1 Binding DB
- 数据表结构
- Token 加密密钥
- Webhook Secret
- Telegram Webhook
- 测试消息发送
- 默认设置是否存在
- Job 定义是否初始化

成功示例：

```text
🛠 Linode Guard Lite Setup Wizard

检查结果：

✅ Telegram Bot Token
✅ Super Admin Telegram ID
✅ D1 Binding DB
✅ 数据表结构
✅ Token 加密密钥
✅ Webhook Secret
✅ Telegram Webhook
✅ 测试消息发送

系统状态：可用

下一步：
1. 添加 Linode 账号
2. 打开账号安全事件监控
3. 配置管理员保活确认
4. 创建定时开关机任务

[添加账号] [系统自检] [打开主菜单]
```

失败示例：

```text
🛠 Linode Guard Lite Setup Wizard

检查结果：

✅ Telegram Bot Token
✅ Super Admin Telegram ID
❌ D1 Binding DB

问题：
没有找到 D1 绑定 DB。
请在 Cloudflare Worker 中绑定 D1 数据库，并确认 binding 名称为 DB。

如果你使用 GitHub 部署，请确认：
1. 已创建 Cloudflare D1 数据库
2. 已设置 CF_D1_DATABASE_ID
3. wrangler.toml 中 binding 名称为 DB
4. 部署命令使用 npm run deploy:github
```

setup 可执行轻量初始化：初始化 settings 默认值、初始化 admin_presence 单行记录、初始化 jobs 默认记录、检查表是否存在。

setup 不应该：自动创建 D1 数据库、自动设置 Worker Secret、自动修改 Cloudflare 配置、自动添加个人本地配置。

---

# 21. 部署自检接口设计

API：

```http
GET /api/v1/diagnostics/deployment
```

建议需要 Bearer Token，因为自检可能暴露系统配置缺失情况，不应公开给互联网。

标准响应：

```json
{
  "ok": true,
  "data": {
    "checks": {
      "db": { "ok": true },
      "telegram_token": { "ok": true },
      "webhook_secret": { "ok": true },
      "encryption_key": { "ok": true },
      "super_admin": { "ok": true },
      "tables": { "ok": true, "missing": [] },
      "webhook": { "ok": true }
    }
  }
}
```

失败响应示例：

```json
{
  "ok": true,
  "data": {
    "checks": {
      "db": {
        "ok": false,
        "error_code": "CONFIG_MISSING",
        "message": "Missing D1 binding DB"
      },
      "tables": {
        "ok": false,
        "missing": ["linode_accounts", "audit_logs"]
      }
    }
  }
}
```

注意：这个接口本身即使某些检查失败，也可以返回 HTTP 200 + `ok:true`，因为“诊断执行成功”。只有诊断接口自身异常，才返回 `ok:false`。

---

# 22. 开源部署文档结构

建议仓库结构：

```text
linode-guard-lite/
  README.md
  LICENSE
  package.json
  wrangler.toml.example
  schema.sql
  secrets.example.md
  src/
    index.ts
    router.ts
    env.ts
    middleware/
    api/
    telegram/
    services/
    clients/
    storage/
    crypto/
    errors/
    utils/
  docs/
    deployment/cloudflare.md
    api.md
    telegram.md
    security.md
    troubleshooting.md
    architecture.md
    mvp-plan.md
  migrations/
    0001_initial.sql
```

README 应包含：项目介绍、产品定位、功能截图或菜单示例、支持能力、不支持能力、快速部署、环境变量、D1 初始化、Telegram Webhook 设置、API 示例、安全说明、FAQ、License。

`docs/deployment/cloudflare.md`：创建 Telegram Bot、获取 Bot Token、获取 Super Admin Telegram ID、创建 Cloudflare D1、应用 schema、设置 Worker Secrets、配置 wrangler、部署 Worker、设置 Telegram Webhook、运行 `/setup`、常见错误。

`docs/api.md`：API 认证、通用响应格式、错误模型、所有 endpoint、请求 / 响应示例、curl 示例。

`docs/telegram.md`：命令列表、主菜单说明、添加账号流程、批量操作流程、安全事件确认、管理员保活确认、定时任务管理、setup wizard。

`docs/security.md`：Token 加密、Worker Secrets、Telegram Super Admin 权限、API Bearer Token、Webhook Secret、审计日志、日志脱敏、数据保留、删除风险说明。

`docs/troubleshooting.md`：Missing D1 binding DB、数据表缺失、Telegram Webhook 不生效、Telegram 消息发送失败、Token 验证失败、Linode API 权限不足、Cron 没执行、D1 migration 问题、GitHub 部署变量问题。

`wrangler.toml.example` 建议：

```toml
name = "linode-guard-lite"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[triggers]
crons = ["* * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "linode-guard-lite"
database_id = "replace-with-your-d1-database-id"

# Optional
# [[kv_namespaces]]
# binding = "KV"
# id = "replace-with-your-kv-namespace-id"

[vars]
APP_TIMEZONE = "Asia/Shanghai"
BATCH_CONCURRENCY = "5"
OPERATION_LOG_RETENTION_DAYS = "1"
LOGIN_EVENT_RETENTION_DAYS = "1"
```

`secrets.example.md` 内容：

```text
需要通过 wrangler secret put 设置：

TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
SUPER_ADMIN_TELEGRAM_ID
API_AUTH_TOKEN
LINODE_TOKEN_ENCRYPTION_KEY
```

示例命令：

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put SUPER_ADMIN_TELEGRAM_ID
wrangler secret put API_AUTH_TOKEN
wrangler secret put LINODE_TOKEN_ENCRYPTION_KEY
```

---

# 23. 环境变量 / Secrets 清单

## 23.1 Worker Secrets

必须：

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
SUPER_ADMIN_TELEGRAM_ID
API_AUTH_TOKEN
LINODE_TOKEN_ENCRYPTION_KEY
```

用途：

- `TELEGRAM_BOT_TOKEN`：发送消息、删除消息、设置 webhook、回调按钮交互
- `TELEGRAM_WEBHOOK_SECRET`：校验 `X-Telegram-Bot-Api-Secret-Token`
- `SUPER_ADMIN_TELEGRAM_ID`：唯一 Super Admin Telegram user id
- `API_AUTH_TOKEN`：HTTP API Bearer Token
- `LINODE_TOKEN_ENCRYPTION_KEY`：Linode Token 加密密钥

## 23.2 Worker Vars

可配置：

```text
APP_TIMEZONE=Asia/Shanghai
BATCH_CONCURRENCY=5
OPERATION_LOG_RETENTION_DAYS=1
LOGIN_EVENT_RETENTION_DAYS=1
```

用途：

- `APP_TIMEZONE`：Telegram 展示时间、夜间登录策略、定时任务默认时区
- `BATCH_CONCURRENCY`：批量实例操作并发控制
- `OPERATION_LOG_RETENTION_DAYS`：审计日志清理
- `LOGIN_EVENT_RETENTION_DAYS`：登录事件清理

## 23.3 D1 Binding

必须：

```text
DB
```

## 23.4 KV Binding

可选：

```text
KV
```

MVP 不强依赖 KV。未来可用于轻量缓存、rate limit 状态、webhook 幂等缓存、短期交互状态。

---

# 24. 日志与数据保留

操作日志默认保留：`OPERATION_LOG_RETENTION_DAYS=1`，清理 Job：`audit_log_cleanup`。

登录事件默认保留：`LOGIN_EVENT_RETENTION_DAYS=1`，清理 Job：`security_event_cleanup`。

注意：登录事件清理后仍然要避免重复推送旧登录事件，所以 `linode_accounts` 表要保存 `last_seen_login_id` 或 `last_login_check_at`。

敏感消息清理对象：用户发送的 Linode Token 消息、临时 Telegram 提示消息、过期 bot_sessions。清理 Job：`message_cleanup`。

---

# 25. 风险说明

## 25.1 删除风险

MVP 默认允许删除实例，且删除前不做二次确认。删除单台实例会直接执行；批量删除会直接执行；保活策略自动删除会直接执行。

缓解：Telegram 创建高危策略时展示风险提示；批量删除菜单展示风险提示；所有删除写审计日志；删除后推送结果；文档中明确说明风险。

## 25.2 Token 泄露风险

Linode Token 拥有云资源管理能力。要求：Token 加密存 D1；加密密钥放 Worker Secret；Telegram 不回显 Token；日志不记录 Token 明文；保存后删除用户 Token 消息；删除失败不影响保存，但要记录脱敏日志。

## 25.3 API Token 泄露风险

HTTP API 使用 Bearer Token。如果 API_AUTH_TOKEN 泄露，可执行高危操作。缓解：使用强随机 Token；不公开部署自检接口；文档建议定期轮换；未来可加 API Token 多 key 管理和权限范围。

## 25.4 Telegram 账号风险

MVP 只支持单 Super Admin。如果 Super Admin Telegram 账号被盗，攻击者可操作 Bot。缓解：Telegram 账号开启 2FA；高风险动作写审计；安全文档明确说明；未来可加二次确认或 passphrase。

## 25.5 Cloudflare Worker 日志风险

Cloudflare 日志可能收集异常信息。要求：sanitize 所有 Token；Linode API 请求头不打印；Telegram message text 如果处于 Token 输入状态，不打印；error details 中不包含敏感字段。

## 25.6 地理位置误判风险

MVP 如果没有 IP Geo API，不应做虚假的地区判断。地区未知时显示“未知”；不使用 Cloudflare 请求国家判断 Linode 登录 IP；文档中明确说明。

## 25.7 Cron 延迟风险

Cloudflare Cron 不是秒级精确定时。定时开关机、登录事件监控、保活策略触发最多可能有数分钟延迟。

文档需说明：

```text
Linode Guard Lite 的定时任务是轻量运维定时，不适合秒级任务调度。
```

## 25.8 D1 免费额度与限制

D1 适合轻量自托管。风险：大量账号 / 大量实例 / 高频日志可能超出免费额度；D1 写入高峰可能失败。

缓解：默认日志保留 1 天；批量操作控制并发；Cron 每分钟唤醒 Job Runner，Job Runner 用 `jobs.next_run_at` 控制各任务实际频率；失败写 job_runs 便于排查。

---

# 26. MVP 实施计划

## Phase 0：项目骨架与基础工程

目标：建立 Cloudflare Workers + D1 的最小可运行项目。

任务：初始化项目结构；配置 TypeScript；配置 Wrangler；添加 `wrangler.toml.example`；添加 `schema.sql` 初稿；添加基础 Router；添加统一 JSON 响应工具；添加 request_id 生成；添加环境变量类型定义；添加基础 `GET /api/v1/health`。

验收：Worker 可本地启动；`/api/v1/health` 返回 `ok:true`；README 有最小启动说明。

## Phase 1：D1 Schema 与 Repository

目标：建立 MVP 所需 D1 表结构和基础数据库访问层。

任务：编写 `schema.sql`；建立 D1 migration；实现 DB helper；实现 settings repository；accounts repository；audit repository；jobs repository；security events repository；schedules repository；admin presence repository。

验收：schema 可应用到 D1；diagnostics 可检查表缺失；Repository 基础 CRUD 可用。

## Phase 2：认证、错误模型、审计日志

目标：建立所有入口共用的安全和错误基础。

任务：定义错误码；实现 AppError；实现 API error response；实现 Telegram error message mapper；实现 API Bearer Token auth；实现 Telegram Webhook Secret 校验；实现 Super Admin 校验；实现 AuditService；添加敏感信息 sanitize 工具。

验收：未带 API Token 返回 `UNAUTHORIZED`；错误响应包含 request_id；非 Super Admin Telegram 请求被拒绝；审计日志可写入 D1；Token 不出现在日志里。

## Phase 3：Telegram 基础入口与菜单

目标：实现 Telegram Bot 默认前端入口。

任务：实现 `/telegram/webhook`；Telegram update parser；`/start`；`/help`；`/cancel`；主菜单渲染；inline keyboard callback router；bot_sessions；TelegramClient sendMessage / editMessage / deleteMessage。

验收：`/start` 展示主菜单；非 Super Admin 被拒绝；按钮 callback 可路由；`/cancel` 可清除 session。

## Phase 4：Setup Wizard 与部署自检

目标：优化开源部署体验。

任务：实现 `SetupService`；环境变量检查；D1 binding 检查；表结构检查；Telegram webhook 检查；Telegram 测试消息发送；默认 settings 初始化；默认 jobs 初始化；`/setup`；`GET /api/v1/diagnostics/deployment`。

验收：`/setup` 展示完整检查结果；缺失 D1 时给人话提示；缺失 Secret 时给人话提示；API 返回结构化 checks。

## Phase 5：Linode 账号与 Token 管理

目标：支持多个 Linode 账号。

任务：实现 CryptoService；token fingerprint；LinodeClient 基础请求；Token 验证；`GET /api/v1/accounts`；`POST /api/v1/accounts`；`DELETE /api/v1/accounts/:account_id`；`POST /api/v1/accounts/:account_id/test`；Telegram 添加账号流程；Token 消息删除记录。

验收：可通过 API 添加账号；可通过 Telegram 添加账号；Token 加密存 D1；D1 不出现 Token 明文；Bot 不回显 Token；添加后尝试删除 Token 消息。

## Phase 6：实例管理

目标：支持查看和操作 Linode 实例。

任务：实现获取单账号实例列表；获取所有账号实例列表；实例详情；开机；关机；重启；删除；对应 API；Telegram 服务器管理菜单；高风险操作写审计日志。

验收：API 可查看实例；Telegram 可查看实例；开机 / 关机 / 重启可执行；删除实例可执行；删除写 audit_logs。

## Phase 7：批量操作

目标：支持单账号和全账号批量操作。

任务：实现 BatchService；并发控制；失败继续执行；单账号批量 boot / shutdown / delete；全账号批量 boot / shutdown / delete；Telegram 批量操作菜单；结果汇总渲染。

验收：批量操作遇到失败不中断；API 返回完整结果；Telegram 返回汇总；批量删除风险等级 critical；所有批量操作写审计日志。

## Phase 8：账号安全事件监控

目标：实现 Account Security Event Monitor。

任务：实现 `/account/logins` 拉取；login_events 保存；去重；last_seen_login_id / last_login_check_at；security settings；LOGIN_SUCCESS；LOGIN_FAILED；TOKEN_INVALID；TOKEN_PERMISSION_ERROR；SUSPICIOUS_IP；FAILED_LOGIN_THRESHOLD_EXCEEDED；NIGHT_LOGIN；Telegram 安全事件推送；事件确认 API；Telegram `[是我] [不是我]`。

验收：新登录事件只推送一次；登录事件保存到 D1；安全事件可查询；Telegram 可确认；Token 异常能生成事件。

## Phase 9：管理员保活确认

目标：实现管理员保活确认及策略触发。

任务：实现 admin_presence 初始化；checkin API；policies CRUD API；策略规则结构；policy runs 去重；notify 动作；shutdown_all_instances 动作；delete_all_instances 动作；Telegram 保活确认菜单；策略创建菜单；策略触发后推送结果；策略触发后写审计日志。

验收：手动确认会重置周期；每周期每规则只触发一次；超时可触发提醒；超时可触发关机 / 删除；自动删除写 critical audit log。

## Phase 10：定时开关机

目标：实现 power schedules。

任务：实现 schedules CRUD API；enable / disable API；cron_expr 解析；next_run_at 计算；due schedules 查询；schedule_power job；schedule_runs；Telegram 定时任务菜单；执行后推送结果；执行后写审计日志。

验收：可创建每天定时关机；可创建每天定时开机；到期后由 Cron 执行；执行结果记录 schedule_runs；Super Admin 收到通知。

## Phase 11：Job Runner

目标：统一 Cron 执行所有后台任务。

任务：实现 jobs 默认初始化；JobRunnerService；job_runs 写入；单 job try/catch；接入 login_monitor、login_timeout、checkin_monitor、schedule_power、message_cleanup、audit_log_cleanup、security_event_cleanup；实现 `GET /api/v1/diagnostics/jobs`。

验收：Cron 每 1 分钟触发；每个 job 有运行记录；一个 job 失败不影响其他 job；diagnostics/jobs 可展示最近状态。

## Phase 12：文档与开源发布准备

目标：达到开源自部署可用状态。

任务：完成 README.md；`docs/deployment/cloudflare.md`；`docs/api.md`；`docs/telegram.md`；`docs/security.md`；`docs/troubleshooting.md`；`secrets.example.md`；补充 wrangler 示例；补充 schema 使用说明；添加 License；添加 MVP limitation 说明；添加风险说明。

验收：新用户按文档可以完成部署；`/setup` 能帮助定位常见问题；API 文档覆盖 MVP 所有接口；安全文档明确 Token、删除、权限风险。

---

# 27. MVP 验收标准

## 27.1 部署验收

- 可部署到 Cloudflare Workers
- 可绑定 D1
- 可应用 schema
- 可设置 Secrets
- Telegram Webhook 可用
- `/setup` 显示系统可用

## 27.2 API 验收

- 所有核心能力都有 `/api/v1/...` API
- API Bearer Token 生效
- 统一响应格式生效
- 统一错误模型生效

## 27.3 Telegram 验收

- `/start` 主菜单可用
- `/setup` 可用
- `/cancel` 可用
- 业务能力通过按钮完成
- 非 Super Admin 被拒绝

## 27.4 Linode 能力验收

- 可添加 Linode 账号
- Token 加密保存
- 可查看实例
- 可开机 / 关机 / 重启 / 删除
- 可批量操作

## 27.5 安全事件验收

- 可拉取 `/account/logins`
- 可去重
- 可生成安全事件
- 可推送 Telegram
- 可确认登录事件
- 可处理未确认超时

## 27.6 保活确认验收

- 可手动确认
- 可创建策略组
- 可触发提醒 / 关机 / 删除
- 每周期每规则只触发一次

## 27.7 定时任务验收

- 可创建定时开机
- 可创建定时关机
- Cron 可执行
- 执行后推送结果

## 27.8 审计与 Job 验收

- 危险操作写审计日志
- Job Runner 有运行记录
- diagnostics/jobs 可展示最近运行状态
- 日志清理可执行

---

# 28. 新会话交接提示词

下面这段可以直接复制到新会话使用。

```text
你现在要帮我开发一个开源项目：Linode Guard Lite。

请严格按我的范围执行，不要做未请求的增强，不要擅自部署到 GitHub 或 Cloudflare。所有额外建议可以先说明，但不要直接实施。

项目定位：
Linode Guard Lite 是一个 API-first 的自托管 Linode / Akamai Cloud 轻量运维控制面，运行在 Cloudflare Workers 上。Telegram 只是默认前端入口之一，所有核心能力必须通过标准 HTTP API 暴露，方便未来扩展 Web UI、CLI、Webhook、手机快捷指令和自动化脚本。

核心技术栈：
- Cloudflare Workers
- TypeScript
- Cloudflare D1
- Telegram Webhook
- Linode / Akamai Cloud API
- Cloudflare Cron Trigger
- 标准 HTTP API
- Cloudflare KV 可选，但 MVP 不强依赖
- Pages 暂不作为核心依赖

请先读取并遵守我提供的 Linode Guard Lite PRD 与技术架构设计文档。如果我已经把文档保存到仓库，请先读取：
- docs/prd-and-architecture.md
或
- docs/linode-guard-lite-design.md

如果当前目录还没有项目文件，请从零开始。
如果当前目录已有文件，请先汇报当前结构，再只做必要修改。

第一阶段不要一次性实现全部功能。
请先帮我实现 Phase 0 到 Phase 2：

Phase 0：项目骨架与基础工程
目标：
建立 Cloudflare Workers + D1 的最小可运行项目。

需要做：
1. 初始化项目结构
2. 配置 TypeScript
3. 配置 Wrangler
4. 添加 wrangler.toml.example
5. 添加 schema.sql 初稿
6. 添加基础 Router
7. 添加统一 JSON 响应工具
8. 添加 request_id 生成
9. 添加环境变量类型定义
10. 添加基础 GET /api/v1/health

Phase 1：D1 Schema 与 Repository
目标：
建立 MVP 所需 D1 表结构和基础数据库访问层。

需要包含这些表：
- settings
- linode_accounts
- security_events
- login_events
- audit_logs
- admin_presence
- admin_presence_policies
- admin_presence_policy_runs
- power_schedules
- schedule_runs
- jobs
- job_runs
- bot_sessions
- telegram_messages

Phase 2：认证、错误模型、审计日志
目标：
建立所有入口共用的安全和错误基础。

需要做：
1. 定义统一错误码
2. 实现 AppError
3. 实现 API error response
4. 实现 API Bearer Token auth
5. 实现 Telegram Webhook Secret 校验的基础函数
6. 实现 Super Admin 校验的基础函数
7. 实现 AuditService
8. 添加敏感信息 sanitize 工具

认证规则：
HTTP API 使用：
Authorization: Bearer <API_AUTH_TOKEN>

Telegram Webhook 使用：
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>

Super Admin：
SUPER_ADMIN_TELEGRAM_ID=123456789

必须支持的 Worker Secrets：
- TELEGRAM_BOT_TOKEN
- TELEGRAM_WEBHOOK_SECRET
- SUPER_ADMIN_TELEGRAM_ID
- API_AUTH_TOKEN
- LINODE_TOKEN_ENCRYPTION_KEY

Worker Vars：
- APP_TIMEZONE=Asia/Shanghai
- BATCH_CONCURRENCY=5
- OPERATION_LOG_RETENTION_DAYS=1
- LOGIN_EVENT_RETENTION_DAYS=1

D1 binding：
- DB

统一 API 成功格式：
{
  "ok": true,
  "data": {}
}

统一 API 失败格式：
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "request_id": "req_xxx"
  }
}

至少定义这些错误码：
- UNAUTHORIZED
- FORBIDDEN
- ACCOUNT_NOT_FOUND
- INSTANCE_NOT_FOUND
- DELETE_DISABLED
- PROTECTED_INSTANCE
- CONFIRMATION_REQUIRED
- CONFIRMATION_EXPIRED
- LINODE_API_ERROR
- RATE_LIMITED
- CONFIG_MISSING
- TOKEN_INVALID
- TOKEN_PERMISSION_ERROR
- TELEGRAM_API_ERROR
- D1_ERROR
- WEBHOOK_SECRET_INVALID
- SCHEDULE_NOT_FOUND
- POLICY_NOT_FOUND
- JOB_FAILED
- VALIDATION_ERROR

请按以下方式工作：
1. 先检查当前目录是否已有项目文件。
2. 如果是空目录，从零创建项目。
3. 如果已有文件，先汇报结构，再只做必要修改。
4. 每次修改前说明要改哪些文件。
5. 实际写代码时保持 MVP 简洁，不要加入 Web UI、复杂权限、多管理员、二次确认、protected instance。
6. 完成后运行可用的检查命令，例如 npm install、npm run typecheck、npm test 或 wrangler 类型检查。
7. 最后给我总结：
   - 创建/修改了哪些文件
   - 已实现哪些能力
   - 如何本地运行
   - 如何配置 secrets
   - 下一阶段建议做什么

请现在开始执行 Phase 0 到 Phase 2。
```
