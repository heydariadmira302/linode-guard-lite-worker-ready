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
        "message": "Linode API error"
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

### POST /api/v1/security/check

手动触发一次账号安全事件检查。会遍历 active Linode 账号，解密 Token 后调用 Linode `GET /account/logins`，只保存账号 `last_seen_login_id` 之后的新 `login_events`，生成对应 `security_events`，并更新账号游标。添加账号前已经存在的历史登录不会生成安全事件通知。

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

安全约束：响应不会返回 token 明文或 encrypted_token，也不会返回 `raw_json` / `metadata_json` 原文。MVP 不实现 IP Geo、国家 / 地区策略、夜间登录策略、复杂安全策略配置或登录确认超时 Job。Telegram 前端展示这些事件时会把 `LOGIN_SUCCESS` / `LOGIN_FAILED` / `TOKEN_INVALID` / `TOKEN_PERMISSION_ERROR` 等内部枚举转换成中文文案。

## Power Schedules API

定时开关机用于配置 boot / shutdown 定时任务。

### GET /api/v1/schedules

查询定时任务列表。支持 `limit`、`offset`。

### POST /api/v1/schedules

创建定时任务。仅支持 `action=boot|shutdown`，`scope=all|account|group`。不支持定时删除服务器。

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

### POST /api/v1/schedules/:schedule_id/enable
### POST /api/v1/schedules/:schedule_id/disable
### POST /api/v1/schedules/disable-all
### POST /api/v1/schedules/enable-all
### DELETE /api/v1/schedules/:schedule_id

`disable-all` 会暂停全部未删除定时任务；`enable-all` 会启用全部未删除定时任务。两者返回本次受影响任务数和任务列表。

变更写入 `audit_logs`：`schedule.create` / `schedule.enable` / `schedule.disable` / `schedule.disable_all` / `schedule.enable_all` / `schedule.delete`，`target_type=power_schedule`，`risk_level=medium`。响应不会返回 token 明文或 encrypted_token。

## Job Runner

Cloudflare Cron 通过 Worker `scheduled` handler 进入统一 Job Runner。建议触发频率：`*/5 * * * *`。

当前 Runner 会执行：

- `schedule_power`：查询 due 的 `power_schedules`，调用 `BatchService` 真正执行到期 boot / shutdown，写 `schedule_runs` 和 `job_runs`。
- `checkin_monitor`：查询管理员保活策略，触发 notify / shutdown_all_instances / delete_all_instances，写 `admin_presence_policy_runs`、`audit_logs` 和 `job_runs`。

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

当前已支持实例只读、单实例开机、关机、重启、删除、批量操作、审计日志查询、账号安全事件监控 MVP、管理员保活确认、定时开关机和 Cloudflare Cron Job Runner。仍不包含 Web UI、多管理员、OAuth、复杂作用范围、指定单台服务器筛选、标签、实例组、二次确认或 protected instance。
