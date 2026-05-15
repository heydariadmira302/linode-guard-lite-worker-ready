# Linode Guard Lite Telegram Frontend

Telegram 是 Linode Guard Lite 的默认前端入口之一，但不是核心业务层。Telegram 回调只作为适配器调用 Service Layer；核心能力同时通过 HTTP API 暴露。

## 常用命令

- `/start`：打开主菜单
- `/setup`：部署 / 初始化向导
- `/cancel`：取消当前流程
- `/help`：查看帮助

## 服务器管理只读流程

Phase 6 / Phase 7A 当前只支持服务器管理的只读查看流程。

入口:

```text
/start → 服务器管理
```

服务器管理菜单包含:

- 查看全部服务器
- 选择账号
- 返回主菜单

### 查看全部服务器

点击「查看全部服务器」后，Bot 会通过 `InstanceService` 读取所有 active Linode 账号下的实例列表。

展示内容包括:

- 账号别名
- 实例 ID
- 实例名称
- 状态
- 区域
- 规格

每台实例只提供「实例详情」入口。

### 选择账号

点击「选择账号」后，Bot 会列出 active Linode 账号。

选择某个账号后，Bot 会展示该账号下的服务器列表。

### 实例详情

实例详情展示只读信息，例如:

- 账号
- ID
- 名称
- 状态
- 区域
- 规格
- IPv4
- IPv6
- 镜像
- 创建时间
- 更新时间
- 标签
- CPU
- 内存
- 磁盘
- 流量

## 错误提示

服务器只读查看失败时，Telegram 会把统一错误码转换成人话提示，例如:

- `ACCOUNT_NOT_FOUND`：找不到这个 Linode 账号，可能已经被删除。
- `TOKEN_INVALID`：Linode Token 无效，请检查后重新添加。
- `TOKEN_PERMISSION_ERROR`：Linode Token 权限不足，请确认 Token 具有读取账号和读取实例权限。
- `LINODE_API_ERROR`：Linode API 调用失败，请稍后重试或检查账号 Token 权限。

错误页会提供「返回服务器管理」按钮。

## 单实例删除

实例详情页提供「删除」按钮：

```text
callback: instances:delete:<account_id>:<instance_id>
```

点击后 Telegram 适配层调用 `InstanceService.deleteInstance(...)`。成功提示：

```text
删除请求已发送

账号：#1 default
实例：#101
```

当前不会做删除前二次确认，不会实现 protected instance。批量删除由批量操作菜单提供。

## 批量操作

主菜单提供「批量操作」入口：

```text
callback: menu:batch
```

菜单入口：

- 单账号批量开机：`batch:accounts:boot`
- 单账号批量关机：`batch:accounts:shutdown`
- 单账号批量删除：`batch:accounts:delete`
- 全部账号批量开机：`batch:all:boot`
- 全部账号批量关机：`batch:all:shutdown`
- 全部账号批量删除：`batch:all:delete`

单账号流程会先选择账号，然后执行：

```text
batch:account:boot:<account_id>
batch:account:shutdown:<account_id>
batch:account:delete:<account_id>
```

Telegram 适配层只调用 `BatchService`，不把核心业务逻辑写在 callback 里。执行后展示汇总：动作、范围、总数、成功、失败和失败详情。

当前不做二次确认，不实现 protected instance，不做标签选择或复杂筛选。Telegram 不展示 token 明文、`encrypted_token` 或审计 metadata 原文。

## 账号安全事件监控

主菜单提供「账号安全事件」入口：

```text
callback: menu:security
```

菜单展示：

- 账号安全事件
- 监控对象说明：Linode / Akamai Cloud 控制台账号登录事件
- 最近事件数量
- 未确认 / open 事件数量

菜单入口：

- 查看事件列表：`security:events`
- 手动检查：`security:check`
- 返回主菜单：`menu:main`

`security:events` 会调用 `SecurityService.listSecurityEvents(...)` 展示最近安全事件，至少包含：

- `type`
- `account_id`
- `status`
- `username`
- `ip`
- `occurred_at`

`security:check` 会调用 `SecurityService.checkAccounts(...)` 手动触发一次 Linode `GET /account/logins` 检查，并展示检查账号数、失败账号数、新增登录事件、新增安全事件和失败账号摘要。

MVP 支持的安全事件类型：

- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `TOKEN_INVALID`
- `TOKEN_PERMISSION_ERROR`

当前不实现 IP Geo，不实现国家 / 地区策略，不实现夜间登录策略，不实现复杂安全策略配置，不实现登录确认超时 Job，不做自动推送策略。Telegram 不展示 token 明文、`encrypted_token` 或 `metadata_json` 原文。

## 管理员保活确认

主菜单提供「管理员保活确认」入口：

```text
callback: menu:admin_presence
```

管理员保活确认 = 你定期告诉系统：我还在，这些机器继续保留；如果太久没确认，系统就按预设策略提醒、关机或删除。它不是检测服务器是否在线，而是检测管理员是否还在管理这些机器。

菜单展示：

- 管理员保活确认
- 最近确认时间
- current_cycle_id
- 启用策略组数量

菜单入口：

- 手动确认：`admin_presence:checkin`
- 查看策略组：`admin_presence:policies`
- 返回主菜单：`menu:main`

`admin_presence:checkin` 会调用 `AdminPresenceService.checkin(...)`，更新最近确认时间和 `current_cycle_id`，并写入审计日志。

`admin_presence:policies` 会调用 `AdminPresenceService.listPolicies(...)` 展示策略组名称、状态、scope 和 action。

管理员保活确认只支持 `scope=all`。支持的策略动作是 `notify`、`shutdown_all_instances`、`delete_all_instances`。Cloudflare Cron 会通过 Job Runner 执行到期策略，其中关机 / 删除策略会真正调用批量操作路径；同一周期内同一策略规则只应触发一次。不实现复杂作用范围、指定账号、标签、实例组、网页管理界面、多人管理员或第三方登录。Telegram 不展示 token 明文或 `encrypted_token`。

## 定时开关机

主菜单提供「定时任务」入口，当前展示定时开关机：

```text
callback: menu:schedules
```

查看定时任务：

```text
callback: schedules:list
```

Telegram 展示任务名称、启用状态、动作、范围、cron 和 next_run_at。核心能力由 HTTP API 和 `ScheduleService` 提供。

当前支持 boot / shutdown，不支持定时删除服务器。

## 审计日志

主菜单提供「审计日志」入口：

```text
callback: menu:audit_logs
```

Telegram 会展示最近审计日志，至少包含：

- `created_at`
- `action`
- `target_type`
- `target_id`
- `risk_level`
- `result`
- `error_code`

Telegram 不展示 token 明文、`encrypted_token` 或 `metadata_json` 原文。

## 当前范围限制

当前已支持服务器只读查看、单实例开机、关机、重启、删除、批量操作、审计日志菜单、账号安全事件监控 MVP、管理员保活确认、定时开关机和 Cloudflare Cron Job Runner。仍不实现复杂作用范围、指定账号、标签、实例组、网页管理界面、多人管理员、第三方登录、二次确认或 protected instance。
