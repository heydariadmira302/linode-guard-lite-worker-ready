# 安全说明

## Linode Token 加密

Linode Token 使用独立的 `LINODE_TOKEN_ENCRYPTION_KEY` 加密后保存到 D1。API、Telegram、审计日志都不应返回 token 明文或 `encrypted_token`。该密钥可在首次 `/setup initialize` 时自动生成并保存到 D1，也可作为 Worker Secret 手动设置。若手动设置，应使用至少 32 字节随机值，例如 `openssl rand -base64 32`，不要使用短密码、Bot Token 或可猜测字符串。

建议为 Linode Token 使用最小必要权限。生产环境优先使用只覆盖所需账号/实例权限的 Token，并定期轮换。

安全设置中提供自动生成 Linode Personal Access Token 的入口：系统会使用当前账号 Token 调用 Linode `POST /profile/tokens` 创建新 Token，然后只保存加密后的新 Token 和指纹，不在 API / Telegram / 审计日志中回显 raw token。该能力应放在二次确认之后执行；本地测试必须 mock Linode token 创建接口，不要调用真实账号生成 Token。

## Runtime Secrets

系统使用以下 runtime secrets：

- `API_AUTH_TOKEN`：HTTP API Bearer Token。
- `TELEGRAM_WEBHOOK_SECRET`：Telegram webhook secret token。
- `LINODE_TOKEN_ENCRYPTION_KEY`：Linode Token 加密密钥。

这些值不得写入 README、docs、日志、Telegram 消息、`.env`、`.dev.vars`、截图或长期记忆。`/api/v1/setup/initialize` 默认不应返回这些 secret 明文；如果未来支持显式 reveal，也必须是一次性安装辅助能力，并提醒用户立即保存。

## API Bearer Token

HTTP API 使用：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

该值可由首次 `/setup initialize` 自动生成，也可手动设置为强随机值。请仅保存在可信环境。当前 MVP 是单一全权管理员 token；如果后续支持 Web UI、多管理员或多 token，应引入 token scope、actor identity 和更细粒度审计。

## Setup 安全

首次 setup/bootstrap 期间可以使用安装凭据证明部署者身份。`TELEGRAM_BOT_TOKEN` 只应作为首次初始化窗口期的临时验证手段；初始化完成后必须使用 `API_AUTH_TOKEN` 管理 HTTP API。

安全要求：

- 初始化完成后，不应继续接受 Bot Token 作为 API bearer。
- Setup 初始化默认不返回 runtime secrets 明文；安装页面默认不请求 reveal。即使 API 显式请求 reveal，也只允许首次返回 `API_AUTH_TOKEN`，不返回 `TELEGRAM_WEBHOOK_SECRET` 或 `LINODE_TOKEN_ENCRYPTION_KEY`。
- Setup 页面和 API 不应记录或回显用户输入的 Bot Token / API Token。
- 如果忘记 API token，应通过 Cloudflare Worker Secrets 或 D1 安全通道重置，而不是在聊天或文档中暴露旧值。

## Webhook Secret

Telegram Webhook 校验 `X-Telegram-Bot-Api-Secret-Token`，必须与独立的 `TELEGRAM_WEBHOOK_SECRET` 一致。该值可由首次 `/setup initialize` 自动生成，不要使用 Bot Token 充当 webhook secret。

建议：

- 使用 constant-time compare 或 digest compare，避免普通字符串比较的时序差异。
- 缺少 secret、settings 表异常或 D1 读取失败时，应稳定拒绝请求，不泄露内部错误细节。
- 所有 Telegram webhook 请求都必须先校验 webhook secret，再解析业务 update。

## Super Admin

Bot 支持一个或多个最高权限 Super Admin Telegram 用户。优先手动设置 `SUPER_ADMIN_TELEGRAM_IDS`（多个数字 ID 用逗号/空格/换行分隔），旧的 `SUPER_ADMIN_TELEGRAM_ID` 仍兼容；也可让首次 Telegram 消息自动绑定一个 Super Admin。请给 Telegram 账号开启 2FA。

首次自动绑定方便部署，但也意味着安装窗口期需要保护好 webhook 地址、Bot Token 和测试环境。生产环境更建议显式设置 `SUPER_ADMIN_TELEGRAM_IDS`；只要配置了 `SUPER_ADMIN_TELEGRAM_IDS` 或旧的 `SUPER_ADMIN_TELEGRAM_ID`，首次消息自动绑定就不会发生，不会扩大未授权窗口。

## Telegram Callback 安全

所有 Telegram `callback_query` 都应调用 `answerCallbackQuery`，避免客户端一直转圈导致重复点击。注意：callback ack 只是 UX 确认，不等于授权；授权仍由 webhook secret、Super Admin 校验和 service 层规则决定。

高危 callback 应具备确认、nonce、过期、防重放：

- 单实例删除：确认页 + 一次性 nonce。
- 批量删除：确认页 + 一次性 nonce。
- 保活 `delete_all_instances` 策略创建/编辑：必须展示强警告；按当前产品规则不做额外文本二次确认。
- 关机 / 重启：建议至少确认或增加防误触设计。

执行成功后应编辑原消息为结果页，旧确认按钮不应再次触发真实操作。

## 审计日志

高风险操作写入 `audit_logs`，包括：

- 实例开机 / 关机 / 重启 / 删除
- 批量操作
- 安全检查
- 管理员保活确认
- 策略组变更
- 定时任务变更
- Cron / Job Runner 执行产生的操作

审计日志不应返回 token 明文、`encrypted_token`、`raw_json`、`metadata_json` 或 `rules_json` 原文。自动生成 Linode Token 记录 `account.token.auto_generate`，metadata 只允许保存账号别名、token label、token id、token fingerprint 等非明文字段。

## 删除风险

实例删除、批量删除、管理员保活策略触发删除所有实例都可能造成不可恢复的数据丢失。上线前请先用测试账号验证。

当前已支持 protected instance：

- 可将关键实例标记为 protected。
- `InstanceService` 对单台关机 / 删除统一检查 protected 状态，命中后拒绝执行。
- `BatchService` 对批量关机 / 批量删除跳过 protected 实例，并写入 `result=skipped` 审计记录。
- 保活最终动作通过 `BatchService` 执行，因此自动关机 / 自动删机也会跳过 protected 实例。

如果启用批量删除或保活自动删机，建议先在 Telegram 的「安全 → 保护实例」里把关键机器加入保护规则，再开启高危策略。

## Linode API 风险

`listInstances` 和 `listAccountLogins` 必须处理 Linode API 分页，否则批量操作、安全基线和登录监控可能漏掉第一页之后的数据。

建议错误映射：

- 401 → `TOKEN_INVALID`
- 403 → `TOKEN_PERMISSION_ERROR`
- 404 → `INSTANCE_NOT_FOUND` 或对应资源不存在
- 409 → 实例状态冲突 / 当前状态不允许操作
- 429 → `RATE_LIMITED`，尊重 `Retry-After`
- 5xx → `LINODE_API_ERROR` 或 `LINODE_SERVER_ERROR`

对用户展示错误时应中文化并避免泄露 Linode Token、Authorization header 或敏感原始响应。

## 安全事件策略

安全事件检查基于 Linode / Akamai Cloud 控制台登录记录，不是 SSH 登录监控。当前策略支持：

- IP Geo / ASN：通过 IP 情报服务查询 country / region / city / ASN / org；列表 API 展示 country / region / city，ASN/组织信息保存在内部 metadata。
- IP 白名单：命中白名单 IP 时仍保存登录事件和游标，但不生成安全事件，避免常用网络刷屏。
- 国家 / 地区策略：`blocked_countries` 命中或 `allowed_countries` 非空且未命中时生成高风险事件。
- 夜间登录策略：按 IANA timezone 和 `night_start` / `night_end` 判断，命中后生成中风险事件。
- Token 错误去重：`TOKEN_INVALID` / `TOKEN_PERMISSION_ERROR` 在配置窗口内只生成一次事件，避免 Telegram 刷屏。

所有策略配置由 `SecuritySettingsService` 统一归一化，避免 Telegram / API / Cron 各自实现规则。

## 数据保留

- `OPERATION_LOG_RETENTION_DAYS`：审计日志保留天数
- `LOGIN_EVENT_RETENTION_DAYS`：登录事件保留天数

## Cloudflare 日志

不要在 Worker 日志中打印 Token、Authorization header、Telegram 用户输入的 Token、runtime secrets 或 D1 中的 encrypted_token。生产环境应尽量减少 debug 输出，并避免把 setup 响应中的敏感字段记录到外部日志系统。


## Cron / Job Runner 防重复执行

Cloudflare Cron 可能因重试、重叠运行或手动触发产生并发。当前实现使用三层保护：

- `jobs.locked_until` / `locked_by` / `lock_started_at`：每个系统 job 执行前先抢占短 TTL 锁，抢不到则跳过。
- `power_schedules.next_run_at` CAS：定时任务执行前基于旧 `next_run_at` 原子推进下一次运行时间，避免同一 due schedule 被重复执行。
- `admin_presence_policy_runs` 唯一键：保活策略先创建 running run 记录抢占 `(policy_id, rule_id, cycle_id)`，执行完成后更新结果，notify 和 final action 都受保护。

旧 D1 升级时，只有确认 `jobs` 表缺少锁字段后，才执行 `migrations/0005_job_locks.sql`。


## Windows 创建安全

Windows Server 2025 简体中文 / English 使用 Microsoft 官方 Evaluation ISO 链接；Windows 11 ISO URL 由 `WindowsIsoResolverService` 自动解析并短期缓存，必须是 HTTPS，且域名只接受 `software.download.prss.microsoft.com` 或 `download.microsoft.com`。ISO URL、Linode Token、Administrator 密码和临时 Ubuntu root 密码不得写入审计 metadata、日志或长期存储。StackScript 需要临时使用 Linode Token 调用 Linode API 配置 block volume、disk、config 和 reboot；Telegram 确认页必须说明该风险。

自定义 Administrator 密码只允许经 Service 层校验后进入一次性创建流程，不写入 D1 或审计日志；Telegram 收到密码消息后会尝试删除原消息。为了避免 autounattend XML 转义造成安装后登录失败，密码禁止 `< > &`、引号、空格和中文。


## Windows 安装完成回调安全

Windows 安装完成通知使用一次性 callback token。创建实例时只把 token 明文传入 StackScript，D1 只保存 SHA-256 hash；回调成功后状态变为 `ready`，同一 token 不可再次使用。回调接口不需要 API Bearer Token，但必须提供有效 token。Telegram 通知只发送 RDP 地址和用户名，不重复发送 Administrator 密码，也不返回 callback token。
