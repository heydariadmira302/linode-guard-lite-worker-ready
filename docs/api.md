# Linode Guard Lite HTTP API

Linode Guard Lite 是 API-first 的自托管 Linode / Akamai Cloud 轻量运维控制面。Telegram 只是默认前端入口之一，核心能力通过标准 HTTP API 暴露。

## 通用规则

Base URL:

```text
/api/v1
```

认证:

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

成功响应:

```json
{
  "ok": true,
  "data": {}
}
```

错误响应:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid API bearer token",
    "request_id": "req_xxx"
  }
}
```

## Accounts API

### GET /api/v1/accounts

查询 active Linode 账号列表。响应不会返回 token 明文或 encrypted_token。

### GET /api/v1/accounts/:account_id

查询单个账号详情，包含账号 ID、昵称、Token 指纹、Token 状态、状态、分组 ID、安全基线时间、创建/更新时间；不会返回 token 明文或 encrypted_token。

### POST /api/v1/accounts

添加 Linode 账号。添加时会检测 Token，建立安全基线，并加密保存 Token。

### PUT /api/v1/accounts/:account_id/token

更新指定账号的 Linode API Token。系统会先测试新 Token，成功后加密保存、更新 Token 指纹和 Token 状态，并重新建立安全基线。响应不会返回 token 明文或 `encrypted_token`。

请求示例：

```json
{
  "token": "<NEW_LINODE_API_TOKEN>"
}
```

### POST /api/v1/accounts/:account_id/test

重新测试账号 Token 可用性，并更新 Token 状态。

### DELETE /api/v1/accounts/:account_id

软删除账号。不会删除 Linode 服务器，但该账号不再参与本系统的服务器管理、批量操作、定时任务和安全检查。

## Instances 只读 API

Phase 6 / Phase 7A 当前只提供 Linode Instance 只读查看能力。

### GET /api/v1/instances

查看所有 active Linode 账号下的实例列表。

```bash
curl -s \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/instances
```

响应示例:

```json
{
  "ok": true,
  "data": {
    "accounts": [
      {
        "account": {
          "id": 1,
          "alias": "default",
          "token_fingerprint": "fp_abc123def456",
          "token_status": "valid",
          "status": "active"
        },
        "instances": [
          {
            "id": 101,
            "label": "web-1",
            "status": "running",
            "region": "jp-osa",
            "type": "g6-standard-1",
            "ipv4": ["203.0.113.10"]
          }
        ]
      }
    ]
  }
}
```

### GET /api/v1/accounts/:account_id/instances

查看指定 active Linode 账号下的实例列表。响应里的账号信息会包含分组名称（如可解析），不会返回 token 明文或 encrypted_token。

```bash
curl -s \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/accounts/1/instances
```

### GET /api/v1/accounts/:account_id/instances/:instance_id

查看指定实例详情。响应会包含账号别名与分组名称（如可解析），不会返回 token 明文或 encrypted_token。

```bash
curl -s \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/accounts/1/instances/101
```


### GET /api/v1/accounts/:account_id/instances/create-options

创建服务器选项接口。用于前端/Telegram 创建向导获取 Region、Plan、Image、Firewall 列表。响应不会返回 token 明文或 encrypted_token。

```bash
curl -s   -H "Authorization: Bearer <API_AUTH_TOKEN>"   http://127.0.0.1:8787/api/v1/accounts/1/instances/create-options
```

### POST /api/v1/accounts/:account_id/instances

创建官方 Linux 服务器。核心创建逻辑在 `InstanceService.createInstance(...)`，Telegram 只负责收集参数并调用该能力。

```bash
curl -X POST   -H "Authorization: Bearer <API_AUTH_TOKEN>"   -H "Content-Type: application/json"   -d '{"region":"jp-osa","type":"g6-nanode-1","image":"linode/ubuntu24.04","firewall_id":null}'   http://127.0.0.1:8787/api/v1/accounts/1/instances
```

成功响应会返回创建出的实例摘要和一次性 `root_password`。不要把该密码写入日志、文档或截图；Telegram 展示后应提醒用户尽快修改。

## 安全说明

- Instances API 会使用已保存账号 Token 调用 Linode API。
- 已保存 Token 只在 Service Layer 内部解密使用。
- API 响应不会返回 token 明文或 encrypted_token。
- 缺少 Bearer Token 返回 `UNAUTHORIZED`。
- 账号不存在或已删除返回 `ACCOUNT_NOT_FOUND`。
- Linode Token 无效返回 `TOKEN_INVALID`。
- Linode Token 权限不足返回 `TOKEN_PERMISSION_ERROR`。
- Linode API 其他错误返回 `LINODE_API_ERROR`。

## Instance 写操作 API

### DELETE /api/v1/accounts/:account_id/instances/:instance_id

删除指定账号下的单台实例。需要 Bearer Token 认证。

```bash
curl -X DELETE \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/accounts/1/instances/101
```

成功响应:

```json
{
  "ok": true,
  "data": {
    "action": "delete",
    "account": {
      "id": 1,
      "alias": "default",
      "token_fingerprint": "fp_abc123def456",
      "token_status": "valid",
      "status": "active"
    },
    "instance_id": 101,
    "result": "success"
  }
}
```

错误模型:

- 缺少 Bearer Token 返回 `UNAUTHORIZED`。
- 账号不存在或已删除返回 `ACCOUNT_NOT_FOUND`。
- Linode Token 无效返回 `TOKEN_INVALID`。
- Linode Token 权限不足返回 `TOKEN_PERMISSION_ERROR`。
- Linode API 其他错误返回 `LINODE_API_ERROR`。

安全约束：响应不会返回 token 明文或 encrypted_token。删除操作会写入 `audit_logs`，`action=instance.delete`，`target_type=instance`，`risk_level=critical`。

## Batch Operations API

批量操作需要 Bearer Token 认证。默认使用 `BATCH_CONCURRENCY` 控制并发；遇到单个实例失败会继续执行，并返回完整汇总和每个实例结果。

Service 层语义要求：如果内部调用 `BatchService` 时传入 `instanceIds`，必须严格校验目标实例。匹配不到任何目标时不能返回 `success total=0`；部分 `instance_id` 不存在或不属于当前账号时，也不能静默忽略。建议返回 `INSTANCE_NOT_FOUND` / `VALIDATION_ERROR`，或明确返回 `failed` / `partial_failed`，并写入审计。当前公开 Batch API 默认按全部实例执行，暂不接受复杂筛选参数；单台服务器范围由定时任务和实例 API 走独立路径。

### 单账号批量操作

```http
POST /api/v1/accounts/:account_id/instances/batch/boot
POST /api/v1/accounts/:account_id/instances/batch/shutdown
POST /api/v1/accounts/:account_id/instances/batch/delete
```

### 分组批量操作

```http
POST /api/v1/groups/:group_id/instances/batch/boot
POST /api/v1/groups/:group_id/instances/batch/shutdown
POST /api/v1/groups/:group_id/instances/batch/delete
```

### 全账号批量操作

```http
POST /api/v1/instances/batch/boot
POST /api/v1/instances/batch/shutdown
POST /api/v1/instances/batch/delete
```

请求体当前不支持复杂筛选；批量操作会默认操作范围内全部实例。当前支持单账号、分组、全部账号三类范围；暂不支持指定单台服务器、标签或实例组筛选。

Boot safety：批量开机默认使用 `app_settings.boot_safety_mode=bot_managed_only`，只开机“上次由本 Bot 成功关机”的实例，避免把用户手动关机的机器误开。成功关机 / 开机 / 删除后会更新 `bot_managed_instances` 状态。若明确需要恢复旧行为，可将 `boot_safety_mode` 调整为 `all_offline`（开机范围内全部离线实例）。定时开机同样通过 `BatchService` 继承该安全策略。

Protected instance：`app_settings.protected_instances` 命中的实例会跳过批量关机 / 批量删除 / 保活最终动作；单台关机 / 删除会被 service 层拦截。批量结果中的条目可能返回 `result=skipped`、`message=已被保护规则跳过`，并写入审计日志。

响应示例：

```json
{
  "ok": true,
  "data": {
    "action": "boot",
    "scope": "account",
    "total": 3,
    "success": 2,
    "failed": 1,
    "result": "partial_failed",
    "items": [
      {
        "account_id": 1,
        "account_alias": "default",
        "instance_id": 101,
        "label": "web-1",
        "result": "success"
      },
      {
        "account_id": 1,
        "account_alias": "default",
        "instance_id": 102,
        "label": "db-1",
        "result": "failed",
        "error_code": "LINODE_API_ERROR",
        "message": "Linode API 请求失败"
      }
    ]
  }
}
```

审计日志：

- `batch.boot`：`risk_level=medium`
- `batch.shutdown`：`risk_level=medium`
- `batch.delete`：`risk_level=critical`
- 每个实例操作都会写入一条 `audit_logs`，`target_type=instance`。
- `result` 使用 `success` / `failed`；API 汇总结果使用 `success` / `partial_failed` / `failed`。

安全约束：响应不会返回 token 明文或 encrypted_token。

## Diagnostics API

### GET /api/v1/diagnostics/deployment

返回部署诊断结果，包括：

- Telegram Bot Token 是否配置
- Runtime Secrets 是否存在
- D1 binding / 必需表是否完整
- `app_settings` 摘要
- Boot safety 当前模式和“Bot 关停待开机实例”数量

响应不会返回 `API_AUTH_TOKEN`、Telegram Bot Token、Linode Token、加密密钥或 `encrypted_token`。

### GET /api/v1/diagnostics/jobs

返回系统 Jobs 诊断结果，包括缺失 Jobs、禁用 Jobs、每个 Job 的启用状态和最近运行信息。

## Security Events API

账号安全事件监控监控的是 Linode / Akamai Cloud 控制台账号登录事件，不是 SSH 登录监控，也不是服务器内部登录监控。MVP 数据源为 Linode API `GET /account/logins`。

### GET /api/v1/security/events

查询安全事件列表。需要 Bearer Token 认证。

查询参数：

- `limit`：返回条数，默认 20，最大 100。
- `offset`：偏移量，默认 0。
- `status`：可选，例如 `open`。
- `type`：可选，MVP 支持 `LOGIN_SUCCESS`、`LOGIN_FAILED`、`TOKEN_INVALID`、`TOKEN_PERMISSION_ERROR`。
- `account_id`：可选，按 Linode 账号过滤。

```bash
curl -s \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  "http://127.0.0.1:8787/api/v1/security/events?limit=20&offset=0&status=open"
```

响应示例：

```json
{
  "ok": true,
  "data": {
    "security_events": [
      {
        "id": 1,
        "account_id": 1,
        "type": "LOGIN_SUCCESS",
        "severity": "medium",
        "status": "open",
        "login_event_id": 1,
        "linode_login_id": "901",
        "username": "alice",
        "ip": "203.0.113.10",
        "country": null,
        "region": null,
        "city": null,
        "occurred_at": "2026-01-02T00:00:00",
        "created_at": "2026-01-02T00:00:00.000Z",
        "updated_at": "2026-01-02T00:00:00.000Z"
      }
    ],
    "limit": 20,
    "offset": 0
  }
}
```

### GET /api/v1/security/settings

读取安全设置。当前设置存储在 `settings.security_settings`，由 Service 层统一归一化后返回。

### PATCH /api/v1/security/settings

更新安全设置，支持字段包括：

- `enabled`：是否启用安全检查。
- `ip_geo_enabled`：是否查询 IP Geo / ASN。
- `ip_allowlist`：受信任 IP 列表；命中后只记录登录事件，不生成安全事件。
- `allowed_countries`：允许国家 / 地区代码列表，例如 `["US", "JP"]`；非空时不在列表内的登录会提升为高风险。
- `blocked_countries`：禁止国家 / 地区代码列表，例如 `["CN"]`；命中后高风险。
- `night_login_enabled`、`night_start`、`night_end`、`timezone`：夜间登录策略。
- `token_error_dedupe_minutes`：Token 无效 / 权限不足事件去重窗口。
- `auto_generate_linode_token_enabled`：Telegram 自动生成 Linode Token 入口开关。
- `auto_generated_token_scopes`、`auto_generated_token_expiry_days`：自动生成 Token 的默认权限和有效期。

### POST /api/v1/security/accounts/:account_id/generate-token

使用当前账号 Token 调用 Linode `POST /profile/tokens` 创建新的 Personal Access Token，并替换系统内加密保存的 Token。响应只返回账号 ID、Token 标签、Token ID、Token 指纹和新安全基线时间，不返回新旧 Token 明文。

> 测试中必须 mock Linode `POST /profile/tokens`；不要在本地验证中调用真实 Token 生成接口。

### POST /api/v1/security/check

手动触发一次账号安全事件检查。会遍历 active Linode 账号，解密 Token 后调用 Linode `GET /account/logins`，只保存账号 `last_seen_login_id` 之后且晚于 `security_baseline_at` / `last_login_check_at` 的新 `login_events`，按安全设置生成对应 `security_events`，并更新账号游标。添加账号前已经存在的历史登录不会生成安全事件通知。

```bash
curl -X POST \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  http://127.0.0.1:8787/api/v1/security/check
```

响应示例：

```json
{
  "ok": true,
  "data": {
    "checked_accounts": 2,
    "failed_accounts": 1,
    "new_login_events": 3,
    "new_security_events": 4,
    "result": "partial_failed",
    "items": [
      {
        "account_id": 1,
        "account_alias": "default",
        "result": "success",
        "new_login_events": 3,
        "new_security_events": 3
      },
      {
        "account_id": 2,
        "account_alias": "backup",
        "result": "failed",
        "new_login_events": 0,
        "new_security_events": 1,
        "error_code": "TOKEN_PERMISSION_ERROR"
      }
    ]
  }
}
```

审计日志：手动检查写入 `audit_logs`，`action=security.check`，`target_type=security`，`risk_level=medium`，`result=success / partial_failed / failed`。

安全约束：响应不会返回 token 明文或 encrypted_token，也不会返回 `raw_json` / `metadata_json` 原文。已支持 IP Geo / ASN 查询、IP 白名单、允许/禁止国家策略、夜间登录策略、Token 无效/权限不足去重，以及在安全设置下触发自动生成 Linode Token。ASN/组织信息保存在事件 metadata 内部，不通过列表 API 直接暴露；`country` / `region` / `city` 会写入安全事件列并可展示。Telegram 前端展示这些事件时会把 `LOGIN_SUCCESS` / `LOGIN_FAILED` / `TOKEN_INVALID` / `TOKEN_PERMISSION_ERROR` 等内部枚举转换成中文文案。

## Power Schedules API

定时任务用于配置 boot / shutdown / reboot 定时任务。不支持定时删除服务器。

时区说明：`cron_expr` 按任务保存的 IANA `timezone` 解释，不再固定按 UTC 解释。例如 `cron_expr=0 22 * * *` 且 `timezone=Asia/Shanghai` 表示每天上海时间 22:00 执行，系统内部保存的 `next_run_at` 为对应 UTC ISO 时间。


### GET /api/v1/schedules

查询定时任务列表。支持 `limit`、`offset`。

### POST /api/v1/schedules

创建定时任务。支持：

- `action=boot|shutdown|reboot`
- `scope=all|account|group|instance`

不支持 `action=delete`，也不允许通过定时任务删除服务器。

创建时必须在 Service 层做范围校验：

- `scope=all`：不需要额外 ID。
- `scope=account`：必须提供 `account_id`，且账号存在、状态为 active。
- `scope=group`：必须提供 `group_id`，且分组存在。
- `scope=instance`：必须同时提供 `account_id` 和 `instance_id`，并校验该实例属于该账号；如果实例不存在或不属于该账号，应返回失败，不应创建一个未来会空跑的任务。

单账号范围示例：

```json
{
  "name": "night shutdown",
  "action": "shutdown",
  "scope": "account",
  "account_id": 1,
  "cron_expr": "0 22 * * *",
  "timezone": "Asia/Shanghai"
}
```

分组范围示例：

```json
{
  "name": "spain shutdown",
  "action": "shutdown",
  "scope": "group",
  "group_id": 2,
  "cron_expr": "0 22 * * *",
  "timezone": "Asia/Shanghai"
}
```

单台服务器范围示例：

```json
{
  "name": "reboot web-1",
  "action": "reboot",
  "scope": "instance",
  "account_id": 1,
  "instance_id": 101,
  "cron_expr": "30 3 * * *",
  "timezone": "Asia/Shanghai"
}
```

### POST /api/v1/schedules/:schedule_id/enable
### POST /api/v1/schedules/:schedule_id/disable
### POST /api/v1/schedules/disable-all
### POST /api/v1/schedules/enable-all
### DELETE /api/v1/schedules/:schedule_id

`disable-all` 会暂停全部未删除定时任务；`enable-all` 会启用全部未删除定时任务。两者返回本次受影响任务数和任务列表。

变更写入 `audit_logs`：`schedule.create` / `schedule.enable` / `schedule.disable` / `schedule.disable_all` / `schedule.enable_all` / `schedule.delete`，`target_type=power_schedule`，`risk_level=medium`。响应不会返回 token 明文或 encrypted_token。

定时任务执行时，如果 instance scope 找不到目标实例，或 BatchService 对指定 `instanceIds` 匹配为空，应记录为失败，不允许记录为 `success total=0`。`schedule_runs.instance_id` 应记录单台服务器任务的目标实例。

## Job Runner

Cloudflare Cron 通过 Worker `scheduled` handler 进入统一 Job Runner。建议触发频率：`* * * * *`。Job Runner 会用 `jobs.next_run_at` 控制各任务实际频率；当前默认所有系统 job 均按约 1 分钟一轮检查。

当前 Runner 会执行：

- `schedule_power`：查询 due 的 `power_schedules`，调用 `BatchService` 真正执行到期 boot / shutdown，写 `schedule_runs` 和 `job_runs`。
- `checkin_monitor`：查询管理员保活策略，触发 notify / shutdown_all_instances / delete_all_instances，写 `admin_presence_policy_runs`、`audit_logs` 和 `job_runs`。
- `message_cleanup`：删除到期 Telegram 消息、清理过期会话；Telegram 消息清理只记录消息 ID，不保存消息正文。

Cron 执行可能有数分钟延迟，不适合秒级任务调度。

## Admin Presence API

管理员保活确认用于让管理员定期确认：我还在，这些机器继续保留。管理员可以手动确认；Cloudflare Cron 会通过 `checkin_monitor` 执行到期策略。`shutdown_all_instances` / `delete_all_instances` 会真正调用批量操作路径，并写入批量操作审计和策略触发审计。

### GET /api/v1/admin-presence/status

查看当前保活状态。需要 Bearer Token 认证。

响应包含：

- `status.last_checkin_at`
- `status.last_checkin_actor`
- `status.current_cycle_id`
- `enabled_policy_count`

### POST /api/v1/admin-presence/checkin

手动保活确认。会更新 `last_checkin_at`、`last_checkin_actor`、`current_cycle_id`。

审计日志：`action=admin_presence.checkin`，`target_type=admin_presence`，`risk_level=medium`，`result=success / failed`。

### GET /api/v1/admin-presence/policies

查询保活策略组列表。支持 `limit`、`offset`。

### GET /api/v1/admin-presence/policies/:policy_id

查询单个保活策略详情。响应包含公开策略字段、解析后的 `rules`、`action`、`scope_type`、`account_id` / `group_id`、提醒时间和最终动作时间；不会返回 `rules_json` 原文、token 明文或 `encrypted_token`。

### POST /api/v1/admin-presence/policies

创建保活策略组。支持 `scope=all`（全部账号）、`scope=account` + `account_id`（单账号）、`scope=group` + `group_id`（分组）。支持配置提醒时间和最终动作时间，单位为分钟；关机 / 删除类策略的最终动作时间必须晚于提醒时间。

请求体示例：

```json
{
  "name": "notify after 7 days",
  "scope": "all",
  "action": "notify",
  "enabled": true,
  "remind_after_minutes": 720,
  "final_after_minutes": 1440
}
```

单账号范围示例：

```json
{
  "name": "single account shutdown",
  "scope": "account",
  "account_id": 1,
  "action": "shutdown_all_instances",
  "enabled": true,
  "remind_after_minutes": 720,
  "final_after_minutes": 1440
}
```

分组范围示例：

```json
{
  "name": "group delete stale",
  "scope": "group",
  "group_id": 2,
  "action": "delete_all_instances",
  "enabled": true,
  "remind_after_minutes": 720,
  "final_after_minutes": 1440
}
```

关机 / 删除类策略会生成两段规则：先在 `remind_after_minutes` 触发提醒，再在 `final_after_minutes` 执行最终动作。`notify` 策略只触发提醒。

支持的 action：

- `notify`
- `shutdown_all_instances`
- `delete_all_instances`

当前支持全部账号、单账号、分组三类范围；不支持指定单台服务器、标签或实例组。

### PATCH /api/v1/admin-presence/policies/:policy_id

编辑保活策略组。支持局部更新：`name`、`enabled`、`action`、`scope`、`account_id`、`group_id`、`remind_after_minutes`、`final_after_minutes`。

示例：

```json
{
  "name": "group delete stale",
  "scope": "group",
  "group_id": 2,
  "action": "delete_all_instances",
  "remind_after_minutes": 1440,
  "final_after_minutes": 4320
}
```

响应仍只返回公开策略字段和解析后的规则，不返回 `rules_json` 原文、token 明文或 `encrypted_token`。审计日志：`admin_presence.policy.update`。

### POST /api/v1/admin-presence/policies/:policy_id/enable

启用策略组。

### POST /api/v1/admin-presence/policies/:policy_id/disable

停用策略组。

### DELETE /api/v1/admin-presence/policies/:policy_id

删除策略组。

策略组变更审计日志：

- `admin_presence.policy.create`
- `admin_presence.policy.update`
- `admin_presence.policy.enable`
- `admin_presence.policy.disable`
- `admin_presence.policy.delete`

`target_type=admin_presence_policy`。risk_level：`notify` 为 `medium`，`shutdown_all_instances` 为 `high`，`delete_all_instances` 为 `critical`。

安全约束：响应不会返回 token 明文或 encrypted_token。保活策略由 Job Runner 触发时会按策略范围执行批量关机或批量删除；每个周期内每个策略规则只应触发一次。

## Setup API 安全语义

`POST /api/v1/setup/schema` 和 `POST /api/v1/setup/initialize` 只用于首次安装和修复初始化。首次 bootstrap 期间可使用安装凭据验证身份；初始化完成后应使用 `API_AUTH_TOKEN`。

`/api/v1/setup/initialize` 默认不应返回以下 runtime secrets 明文：

- `API_AUTH_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `LINODE_TOKEN_ENCRYPTION_KEY`

如果未来为了安装体验支持 reveal，也必须是显式、一次性的 reveal，并在 UI 中提醒立即保存；不能在普通 API 响应、日志或 Telegram 消息中长期展示。

## 推荐错误码

- `VALIDATION_ERROR`：请求格式或 scope 参数错误。
- `ACCOUNT_NOT_FOUND`：账号不存在或已删除。
- `GROUP_NOT_FOUND`：分组不存在。
- `INSTANCE_NOT_FOUND`：实例不存在，或不属于指定账号。
- `TOKEN_INVALID`：Linode Token 无效。
- `TOKEN_PERMISSION_ERROR`：Linode Token 权限不足。
- `RATE_LIMITED`：Linode API 返回 429，建议稍后重试。
- `LINODE_API_ERROR`：其他 Linode API 错误。

所有 API 响应都不应泄露 token 明文、`encrypted_token`、`raw_json`、`metadata_json`、`rules_json` 或 runtime secrets。

## Audit Logs API

### GET /api/v1/audit-logs

查询审计日志列表。需要 Bearer Token 认证。

查询参数:

- `limit`：返回条数，默认 20，最大 100。
- `offset`：偏移量，默认 0。
- `action`：可选，按 action 过滤，例如 `instance.delete`。

```bash
curl -s \
  -H "Authorization: Bearer <API_AUTH_TOKEN>" \
  "http://127.0.0.1:8787/api/v1/audit-logs?limit=20&offset=0&action=instance.delete"
```

响应示例:

```json
{
  "ok": true,
  "data": {
    "audit_logs": [
      {
        "id": 1,
        "request_id": "req_xxx",
        "actor": "api:default",
        "source": "api",
        "action": "instance.delete",
        "target_type": "instance",
        "target_id": "101",
        "risk_level": "critical",
        "result": "success",
        "error_code": null,
        "created_at": "2026-01-02T00:00:00.000Z"
      }
    ],
    "limit": 20,
    "offset": 0
  }
}
```

安全约束：审计日志查询不会返回 token 明文或 encrypted_token，也不会返回 `metadata_json` 原文。

## 当前范围限制

当前已支持实例只读、单实例开机、关机、重启、删除、批量操作、Boot safety、protected instance、审计日志查询、账号安全事件监控 MVP、管理员保活确认、定时开关机/重启、单台服务器定时任务和 Cloudflare Cron Job Runner。仍不包含 Web UI、多管理员、OAuth、标签或实例组。


## Windows Server / Windows 11 创建 API

Windows 创建采用 API-first / Service-first 的私有 StackScript 路线。Telegram 只负责选择账号、版本、语言、Region、Plan、Firewall 和确认；核心逻辑在 `WindowsInstanceService`。Windows Server 2022 为稳定路线，Windows Server 2025 简体中文版 / English、Windows Server 2025 / Windows 11 简体中文 DD 快速安装和 Windows 11 Enterprise LTSC 2024 为实验路线。

### GET /api/v1/windows/versions

返回可创建的 Windows 版本与语言：`2k22`、`2k25-cn`、`2k25-cn-dd`、`2k25-en`、`w11-cn-dd`、`w11-ltsc-2024`，语言 `zh-cn` / `en-us`。Windows Server 2025 简体中文、Server 2025 DD 与 Win11 DD 快速安装默认 `zh-cn`，English 默认 `en-us`；Windows 11 ISO 路线会标记 `requires_iso_resolve=true`、`iso_resolved_automatically=true`。

### GET /api/v1/accounts/:account_id/windows/stackscript

查看当前账号是否已经配置 Windows 私有 StackScript。

### POST /api/v1/accounts/:account_id/windows/stackscript

为当前 Linode 账号创建或更新私有 StackScript。该操作只写入 Linode StackScript，不创建服务器、不产生实例费用，但属于外部账号写操作，会写审计日志。

### GET /api/v1/accounts/:account_id/windows/create-options

支持 query：`version=2k22|2k25-cn|2k25-en|w11-ltsc-2024`、`lang=zh-cn|en-us`。返回符合该版本最低内存/磁盘要求的 core region 与 plan，并返回 `iso_resolve_required` / `iso_cached`。

获取 Windows 创建可选项：Region、满足最低内存/磁盘要求的 Plan、Firewall。当前路线固定为 `Windows Server 2022 Evaluation`，基础镜像为 `linode/ubuntu22.04`。

### POST /api/v1/accounts/:account_id/windows/instances

请求体支持 `version` / `lang` / `label` / `administrator_password` / `windows_username`。`version=2k25-cn` / `2k25-en` 时会分别传入 `INSTALL_WINDOWS_VERSION=2k25-cn|2k25-en`、`WINDOWS_LANG=zh-cn|en-us` 和 Windows Server 2025 镜像名；`version=2k25-cn-dd` / `w11-cn-dd` 时会传入对应 `INSTALL_WINDOWS_VERSION`、`WINDOWS_LANG=zh-cn` 和 `DD_IMAGE_URL`。默认使用内置镜像 `https://dl.lamp.sh/vhd/zh-cn_win2025.xz` / `https://dl.lamp.sh/vhd/zh-cn_windows11_22h2.xz`；`version=w11-ltsc-2024` 时，Service 会自动解析官方 ISO 并传入 StackScript：`INSTALL_WINDOWS_VERSION=w11`、`WINDOWS_IMAGE_NAME`、`WINDOWS_LANG`、`W11_ISO_URL`。解析失败时不创建实例。

创建 Windows Server 2022。请求体示例：

```json
{
  "region": "jp-osa",
  "type": "g6-dedicated-2",
  "firewall_id": null
}
```

服务端会自动生成：

- Windows `Administrator` 密码
- 临时 Ubuntu root 密码

响应会一次性返回这些密码；不要写入日志、文档或截图。创建后 StackScript 会把新建 Ubuntu 22.04 实例转换为 Windows Server 2022，安装期间会多次重启，预计 15-30 分钟。Windows 为非官方支持路线，失败时需通过 Linode LISH/控制台查看 `/root/windows-stackscript.log`。


## Windows 安装完成回调 API

### POST /api/v1/windows/install-callback

由 Windows 安装完成脚本自动调用，不需要 API Bearer Token，也不提供手动触发入口。请求体包含一次性 `token`、`ip_address`、`rdp_port`、`status`。Service 只保存 token hash，回调成功后状态从 `installing` 改为 `ready`，并通过 Telegram 主动通知管理员。响应不会返回 token 或密码。
