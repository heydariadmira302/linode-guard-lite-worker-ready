# Linode Guard Lite Telegram Frontend

Telegram 是 Linode Guard Lite 的默认前端入口之一，但不是核心业务层。Telegram 回调只作为适配器调用 Service Layer；核心能力同时通过 HTTP API 暴露。

## 常用命令

- `/start`：打开主菜单
- `/setup`：部署 / 初始化向导
- `/cancel`：取消当前流程
- `/help`：查看帮助

## 账号管理

主菜单提供「账号」入口：

```text
callback: menu:accounts
```

账号菜单支持：

- 查看账号列表：`accounts:list`
- 添加账号：`accounts:add`

账号列表会展示账号 ID、昵称、状态、Token 指纹和 Token 状态，并为每个账号提供详情入口：

```text
accounts:detail:<account_id>
```

账号详情展示：账号状态、Token 状态、Token 指纹、分组、安全基线时间、创建/更新时间。Telegram 不展示 token 明文或 `encrypted_token`。

账号详情操作：

- 测试 Token：`accounts:test:<account_id>`，调用 `AccountService.testAccount(...)`
- 更新 Token：`accounts:update_token:<account_id>`，进入会话状态 `updating_account_token`，用户发送新 Token 后调用 `AccountService.updateAccountToken(...)`；Bot 会尝试删除 Token 消息，不在回复中回显 Token，更新成功后重新建立安全基线，历史登录不通知。
- 移动分组：`accounts:move_group:<account_id>` → `accounts:move_group_to:<account_id>:<group_id>`，调用 `GroupService.moveAccountToGroup(...)`
- 删除账号：`accounts:delete_confirm:<account_id>` → `accounts:delete:<account_id>`，调用 `AccountService.deleteAccount(...)`

删除账号会先展示中文二次确认，提示不会删除 Linode 服务器，但会停止本 Bot 对该账号的管理。

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
- 分组名称
- 实例 ID
- 实例名称
- 状态
- 区域
- IPv4（列表展示第一个 IPv4）

每台实例提供「实例详情」入口。列表页会根据当前来源提供返回按钮，例如返回服务器管理、返回分组服务器或返回账号服务器。

### 选择账号

点击「选择账号」后，Bot 会列出 active Linode 账号。

选择某个账号后，Bot 会展示该账号下的服务器列表。

### 实例详情

实例详情展示信息，例如:

- 账号
- 分组
- ID
- 名称
- 状态
- 区域
- IPv4（全部 IPv4）
- 镜像
- 创建时间
- 更新时间
- 标签
- CPU
- 内存
- 磁盘
- 流量

IPv6 暂不展示。详情页会根据服务器状态展示中文操作按钮：运行中显示「关机 / 重启 / 删除」，已关机显示「开机 / 删除」，未知状态显示「刷新」。删除会先进入中文二次确认。

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
- 分组详情页批量开机：`batch:group:boot:<group_id>`
- 分组详情页批量关机：`batch:group:shutdown:<group_id>`
- 分组详情页批量删除：`batch:group:delete:<group_id>`
- 全部账号批量开机：`batch:all:boot`
- 全部账号批量关机：`batch:all:shutdown`
- 全部账号批量删除：`batch:all:delete`

单账号流程会先选择账号，然后进入二次确认：

```text
batch:account:boot:<account_id>
batch:account:shutdown:<account_id>
batch:account:delete:<account_id>
```

确认后才执行：

```text
batch:account:run:boot:<account_id>
batch:account:run:shutdown:<account_id>
batch:account:run:delete:<account_id>
batch:group:run:boot:<group_id>
batch:group:run:shutdown:<group_id>
batch:group:run:delete:<group_id>
batch:all:run:boot
batch:all:run:shutdown
batch:all:run:delete
```

Telegram 适配层只调用 `BatchService`，不把核心业务逻辑写在 callback 里。执行后展示汇总：动作、范围、总数、成功、失败和失败详情。

当前批量操作都会先展示中文二次确认，删除会显示高危警告。不实现 protected instance，不做标签选择或复杂筛选。Telegram 不展示 token 明文、`encrypted_token` 或审计 metadata 原文。

## 安全事件

主菜单提供「安全事件」入口：

```text
callback: menu:security
```

菜单标题：

```text
🛡 安全事件
```

菜单展示：

- 监控对象说明：Linode / Akamai Cloud 控制台账号登录事件
- 说明这不是 SSH 登录监控，也不是服务器内部登录监控
- 未确认事件数量
- 最近事件数量

菜单入口按钮使用中文文案：

- 查看未确认：`security:events:open`
- 查看最近事件：`security:events`
- 手动检查：`security:check`
- ❤️ 打卡：`admin_presence:checkin`

`security:events:open` 和 `security:events` 会调用 `SecurityService.listSecurityEvents(...)` 展示安全事件，至少包含：

- 事件类型
- 账号 ID
- 状态
- 用户
- IP
- 时间

Telegram 用户可见事件类型必须转成中文，不直接裸露内部枚举：

- `LOGIN_SUCCESS` → `成功登录`
- `LOGIN_FAILED` → `登录失败`
- `TOKEN_INVALID` → `Token 无效`
- `TOKEN_PERMISSION_ERROR` → `Token 权限不足`

Telegram 用户可见事件状态也必须转成中文，例如：

- `open` → `未确认`
- `confirmed` → `已确认：是我`
- `suspicious` → `已标记：不是我`

未确认事件会提供中文操作按钮：

- 是我：`security:confirm:<event_id>`
- 不是我：`security:suspicious:<event_id>`
- ❤️ 打卡：`admin_presence:checkin`

点击「是我」时，Telegram 适配层调用 `SecurityService.updateSecurityEventStatus(..., "confirmed", ...)`，并展示中文确认状态。

点击「不是我」时，Telegram 适配层调用 `SecurityService.updateSecurityEventStatus(..., "suspicious", ...)`，并展示中文风险建议，例如撤销或重置相关 Token、检查账号近期登录记录和服务器状态、修改密码并检查二次验证。

`security:check` 会调用 `SecurityService.checkAccounts(...)` 手动触发一次 Linode `GET /account/logins` 检查，并展示检查账号数、失败账号数、新增登录事件、新增安全事件和失败账号摘要。检查结果和失败原因面向 Telegram 用户时使用中文描述。

安全基线规则：添加账号时建立 `security_baseline_at` / `last_seen_login_id` / `last_login_check_at`。后续检查只处理 `last_seen_login_id` 之后的新登录，添加账号前的历史登录不会生成 Telegram 安全事件通知。

当前不实现 IP Geo，不实现国家 / 地区策略，不实现夜间登录策略，不实现复杂安全策略配置，不实现登录确认超时 Job，不做自动推送策略。Telegram 不展示 token 明文、`encrypted_token`、`raw_json` 或 `metadata_json` 原文。

## 管理员保活确认

主菜单提供「管理员保活确认」入口：

```text
callback: menu:admin_presence
```

管理员保活确认 = 你定期告诉系统：我还在，这些机器继续保留；如果太久没确认，系统就按预设策略提醒、关机或删除。它不是检测服务器是否在线，而是检测管理员是否还在管理这些机器。

菜单展示：

- ❤️ 保活打卡
- 最近确认时间
- 启用策略组数量

菜单入口：

- 手动确认：`admin_presence:checkin`
- 查看策略组：`admin_presence:policies`

`admin_presence:checkin` 会调用 `AdminPresenceService.checkin(...)`，更新最近确认时间和内部 `current_cycle_id`，并写入审计日志。Telegram 打卡成功只展示最近确认时间，不展示 `current_cycle_id`。

`admin_presence:policies` 会调用 `AdminPresenceService.listPolicies(...)` 展示策略组名称、状态、范围和动作，列表中每条策略都有详情入口。Telegram 用户可见文案会中文化：

- `notify` → `只通知`
- `shutdown_all_instances` → `关闭全部服务器`
- `delete_all_instances` → `删除全部服务器`
- `scope=all` → `全部账号`
- `scope=account:<account_id>` → `单账号 #<account_id>`
- `scope=group:<group_id>` → `分组 #<group_id>`

策略组列表中每条策略提供详情、启用 / 停用按钮：

- 详情：`admin_presence:policy:detail:<policy_id>`
- 启用：`admin_presence:policy:enable:<policy_id>`
- 停用：`admin_presence:policy:disable:<policy_id>`

点击启用 / 停用时，Telegram 适配层调用 `AdminPresenceService.enablePolicy(...)` / `AdminPresenceService.disablePolicy(...)`，并展示中文结果。

Telegram 支持查看保活策略详情和新建保活策略：

- 入口：`admin_presence:policy:create`
- 选择最终动作：`admin_presence:policy:create_action:notify` / `admin_presence:policy:create_action:shutdown_all_instances` / `admin_presence:policy:create_action:delete_all_instances`
- 选择作用范围：`admin_presence:policy:create_scope:<action>:all|account|group`
- 选择具体账号：`admin_presence:policy:create_account:<action>:<account_id>`
- 选择具体分组：`admin_presence:policy:create_group:<action>:<group_id>`
- 选择提醒时间：`admin_presence:policy:create_remind:<action>:<scope>:<minutes>`，当前按钮给出 12 小时、24 小时、3 天等预设
- 选择最终动作时间：`admin_presence:policy:create_final:<action>:<scope>:<remind_after_minutes>:<final_after_minutes>`，必须晚于提醒时间
- 输入策略名称后创建

选择 `删除全部服务器` 时会先展示高危警告，但不会要求第二次文本确认；该策略规则生效后到达触发条件会直接执行。Telegram 只负责提醒和收集时间/名称，不再做额外的删除确认。

管理员保活确认支持 `scope=all`（全部账号）、`account:<account_id>`（单账号）和 `group:<group_id>`（分组）。支持的策略动作是 `notify`、`shutdown_all_instances`、`delete_all_instances`。Cloudflare Cron 会通过 Job Runner 执行到期策略，其中关机 / 删除策略会按策略范围调用批量操作路径；同一周期内同一策略规则只应触发一次。不支持单台实例范围、标签、实例组、网页管理界面、多人管理员或第三方登录。Telegram 不展示 token 明文、`encrypted_token` 或 `rules_json` 原文。当前 Telegram 支持查看详情、启用、停用、删除和新建保活策略。

## 定时任务

主菜单提供「定时任务」入口，当前展示定时开关机：

```text
callback: menu:schedules
```

菜单标题：

```text
⏰ 定时任务
```

菜单入口：

- 新增任务：`schedules:create`
- 查看定时任务：`schedules:list`
- ❤️ 打卡：`admin_presence:checkin`

Telegram 展示任务名称、启用状态、动作、范围、Cron 和下次运行时间。核心能力由 HTTP API 和 `ScheduleService` 提供。

用户可见文案必须中文化：

- `boot` → `开机`
- `shutdown` → `关机`
- `all` → `全部账号`
- `account` → `单账号 #<account_id>`
- `group` → `分组 #<group_id>`
- `enabled=1` → `启用`
- `enabled=0` → `停用`

定时任务列表中的每条任务提供：

- 启用 / 停用：`schedules:enable:<schedule_id>` / `schedules:disable:<schedule_id>`
- 删除：`schedules:delete_confirm:<schedule_id>`
- ❤️ 打卡：`admin_presence:checkin`

点击启用 / 停用时，Telegram 适配层调用 `ScheduleService.enableSchedule(...)` / `ScheduleService.disableSchedule(...)`，并展示中文结果。

点击删除时，先展示二次确认：

- 确认删除：`schedules:delete:<schedule_id>`
- 取消：`schedules:list`

确认删除后，Telegram 适配层调用 `ScheduleService.deleteSchedule(...)`，并展示中文结果。

Telegram 支持快速新增定时任务：

- 入口：`schedules:create`
- 选择动作：`schedules:create:action:boot` / `schedules:create:action:shutdown`
- 选择全部账号范围：`schedules:create:scope:<action>:all`
- 选择单账号范围：`schedules:create:scope:<action>:account`
- 选择具体账号：`schedules:create:account:<action>:<account_id>`
- 选择分组范围：`schedules:create:scope:<action>:group`
- 选择具体分组：`schedules:create:group:<action>:<group_id>`
- 选择预设时间：`schedules:create:preset:<action>:all:daily_0800` / `schedules:create:preset:<action>:all:daily_2200`
- 选择单账号预设时间：`schedules:create:preset:<action>:account:<account_id>:daily_0800` / `schedules:create:preset:<action>:account:<account_id>:daily_2200`
- 选择分组预设时间：`schedules:create:preset:<action>:group:<group_id>:daily_0800` / `schedules:create:preset:<action>:group:<group_id>:daily_2200`
- 输入自定义时间：`schedules:create:custom:<action>:all` / `schedules:create:custom:<action>:account:<account_id>` / `schedules:create:custom:<action>:group:<group_id>`

快速新增当前支持 `scope=all`（全部账号）、`scope=account`（单账号）和 `scope=group`（分组），时间支持两个常用预设：每天 08:00、每天 22:00。也支持输入自定义时间或 Cron：用户可以发送 `09:30` / `22:00` 这类时间，系统会转换为每天执行的 Cron；也可以直接发送 5 段 Cron，例如 `30 9 * * *`。创建时 Telegram 适配层只收集按钮/文本输入并调用 `ScheduleService.createSchedule(...)`，不把定时任务业务逻辑写在 callback 里。

当前支持查看、新增、启用、停用、暂停全部、启用全部、删除定时开机 / 关机任务。不支持定时删除服务器；暂不支持 Telegram 内创建单台服务器范围或重启任务。

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
