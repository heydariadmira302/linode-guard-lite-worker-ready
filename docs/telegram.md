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

普通添加账号流程会先输入账号昵称，再输入 Linode Token；未指定分组时默认进入「未分组」。输入昵称阶段提供「取消添加 / 返回账号管理」；输入 Token 阶段提供「重新输入昵称 / 取消添加 / 返回账号管理」。从分组详情或分组账号页点击「添加账号到本组」时，会进入 `accounts:add:to_group:<group_id>`，输入昵称后直接归入当前分组，并把返回按钮改为「返回分组详情」。添加成功后的「继续添加到本组」会保留当前分组上下文，不会掉回默认分组。创建账号时 Telegram 只收集输入并把 `group_id` 传给 `AccountService.createAccount(...)`。

账号列表会展示账号 ID、昵称、中文状态、所属分组、Token 指纹和 Token 状态，并为每个账号提供详情入口。账号列表同时展示分组名称，方便确认账号是否进入正确分组：

```text
accounts:detail:<account_id>
```

账号详情展示：账号状态、Token 状态、Token 指纹、分组、安全基线时间、创建/更新时间。Telegram 不展示 token 明文或 `encrypted_token`。

账号详情操作：

- 查看该账号服务器：`instances:list:account:<account_id>`，进入该账号服务器列表。
- 测试 Token：`accounts:test:<account_id>`，调用 `AccountService.testAccount(...)`
- 更新 Token：`accounts:update_token:<account_id>`，进入会话状态 `updating_account_token`，用户发送新 Token 后调用 `AccountService.updateAccountToken(...)`；Bot 会尝试删除 Token 消息，不在回复中回显 Token，更新成功后重新建立安全基线，历史登录不通知。更新流程提供「取消更新 / 返回账号详情」，失败后也继续提供取消按钮。
- 移动分组：`accounts:move_group:<account_id>` → `accounts:move_group_to:<account_id>:<group_id>`，调用 `GroupService.moveAccountToGroup(...)`
- 从 Bot 删除账号：`accounts:delete_confirm:<account_id>` → `accounts:delete:<account_id>`，调用 `AccountService.deleteAccount(...)`

删除账号会先展示中文二次确认，提示不会删除 Linode 服务器，但会停止本 Bot 对该账号的管理。

## 服务器管理流程

当前已支持服务器列表、详情、单实例开机 / 关机 / 重启 / 删除、Boot safety、protected instance 拦截和批量操作入口。下一轮产品重点是继续优化服务器详情页的信息架构和按钮层级。

入口:

```text
/start → 服务器管理
```

服务器管理入口采用“列表优先”：聊天框下方和主菜单里的「🖥 服务器」会直接展示全部服务器列表；`menu:instances` 作为服务器管理说明页，提供「🖥 查看全部服务器 / ➕ 创建服务器 / 🔎 筛选 / ⚡ 批量操作 / 返回主菜单」。

服务器筛选页包含：

- 👤 按账号查看
- 📁 按分组查看
- 🟢 运行中
- ⚫️ 已关机

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

### 创建服务器

创建服务器参考旧版 Bot 的流程，但新版必须保持 API-first / Service-first：

```text
Telegram 选择账号 / Region / Plan / OS / Firewall
→ InstanceService.getCreateOptions(...) / InstanceService.createInstance(...)
→ Linode API
```

当前 Telegram 创建入口为「➕ 创建服务器」，流程：

1. 选择账号
2. 选择 Region
3. 选择 Plan
4. 选择 Linux Image
5. 选择 Firewall 或不使用防火墙
6. 确认创建

确认后调用 `InstanceService.createInstance(...)`，不会在 Telegram callback 里直接拼业务逻辑。创建成功后会展示一次性 root 密码，并提醒尽快修改。当前先支持官方 Linux 创建；Windows StackScript 路线后续如接入，也应先落 service/API，再接 Telegram 展示层。

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

IPv6 暂不展示。详情页按钮采用“当前状态主操作 + 危险操作 + 返回列表”的减法结构：运行中展示「⚠️ 关机 / 🔄 重启 / 🚨 危险操作 / ⬅️ 返回列表」，已关机展示「✅ 开机 / 🚨 危险操作 / ⬅️ 返回列表」，处理中或未知状态展示「🔄 刷新状态 / 🚨 危险操作 / ⬅️ 返回列表」。不再保留抽象的「管理更多」层，避免从单台服务器上下文跳到全局功能造成迷路。删除仍在「危险操作 → 删除服务器」里，不和开机/关机/重启平级出现。重启会先进入中文确认页。

## 错误提示

服务器只读查看失败时，Telegram 会把统一错误码转换成人话提示，例如:

- `ACCOUNT_NOT_FOUND`：找不到这个 Linode 账号，可能已经被删除。
- `TOKEN_INVALID`：Linode Token 无效，请检查后重新添加。
- `TOKEN_PERMISSION_ERROR`：Linode Token 权限不足，请确认 Token 具有读取账号和读取实例权限。
- `LINODE_API_ERROR`：Linode API 调用失败，请稍后重试或检查账号 Token 权限。

错误页会提供「返回服务器管理」按钮。

## 单实例删除

当前实例删除入口在「🚨 危险操作」。删除不是直接执行，而应先进入确认页：

```text
callback: instances:confirm_delete:<account_id>:<instance_id>
```

确认页应明确提示“删除后通常无法恢复”。用户确认后才调用 `InstanceService.deleteInstance(...)`：

```text
callback: instances:delete:<account_id>:<instance_id>[:nonce]
```

成功提示：

```text
删除请求已发送

账号：#1 default
实例：#101
```

上线前建议为删除确认加入短期 nonce / session / 过期机制：确认按钮只能使用一次，执行后立即失效，旧消息按钮不能再次触发真实删除。批量删除由批量操作菜单提供，并同样应具备确认和防重放机制。

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

Telegram 适配层只调用 `BatchService`，不把核心业务逻辑写在 callback 里。执行后展示汇总：动作、范围、总数、成功、失败、跳过保护和失败详情。失败原因必须尽量转成用户能理解的中文，例如 Token 无效、Token 权限不足、服务器不存在、Linode API 请求失败或请求过于频繁。结果页提供「查看审计日志」入口。

Boot safety：批量开机默认只会开机“上次由 Bot 成功关停”的实例，避免误开用户手动关机的机器。批量关机 / 单台关机成功后会记录 Bot 管理状态；批量开机 / 单台开机成功后会把状态更新为已开机。若系统设置改为 `all_offline`，才会开机范围内全部离线实例。

批量操作菜单已收敛为“先选范围，再选动作”：单账号批量操作 / 分组批量操作 / 全部账号批量操作会先进入范围选择，再选择批量开机或批量关机。批量删除不再和开关机平铺在一起，而是单独放在「🚨 批量删除」高危入口里；删除会显示高危预览，点击「⚠️ 我知道风险，继续」后还必须发送精确文本 `DELETE` 才会真正执行。

Protected instance 已接入：批量关机 / 批量删除 / 保活最终动作会跳过命中的保护实例，并在结果里展示“保护跳过”；单台关机 / 删除会被直接拦截并提示先移除保护规则。单台开机 / 关机 / 重启结果页提供「查看审计日志」入口；单台删除结果页额外提示删除通常不可恢复，并提供「查看审计日志」入口。Telegram 不展示 token 明文、`encrypted_token` 或审计 metadata 原文。

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
- 安全设置：`security:settings`
- ❤️ 打卡：`admin_presence:checkin`

`security:events:open` 和 `security:events` 会调用 `SecurityService.listSecurityEvents(...)` 展示安全事件，至少包含：

- 事件类型
- 账号 ID
- 状态
- 用户
- IP
- 位置（country / region / city，如已查询）
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

`security:settings` 展示安全设置摘要，包括安全检查开关、IP Geo / ASN、IP 白名单、允许/禁止国家、夜间登录策略、Token 错误去重窗口和自动生成 Linode Token 开关。Telegram 先提供常用开关：

- `security:settings:auto_token:on|off`：启用/停用自动生成 Linode Token 入口。
- `security:settings:ip_geo:on|off`：启用/停用 IP Geo / ASN 查询。
- `security:settings:night:on|off`：启用/停用夜间登录策略。

自动生成 Linode Token 流程放在安全设置下：

- `security:token:accounts`：选择账号。
- `security:token:confirm:<account_id>`：二次确认。
- `security:token:generate:<account_id>`：调用 Service 层创建新 Linode Personal Access Token，替换系统加密保存的 Token，并重新建立安全基线。

Telegram 不展示新旧 token 明文、`encrypted_token`、`raw_json` 或 `metadata_json` 原文。复杂配置如 IP 白名单、国家列表、夜间时间段和默认 scopes 可通过 HTTP API 更新。当前仍不实现登录确认超时 Job，不做自动推送策略。

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

策略详情页支持编辑：

- 编辑入口：`admin_presence:policy:edit:<policy_id>`
- 修改名称：`admin_presence:policy:edit_name:<policy_id>`，随后输入新名称
- 修改最终动作：`admin_presence:policy:edit_action:<policy_id>` → `admin_presence:policy:edit_action_to:<policy_id>:notify|shutdown_all_instances|delete_all_instances`
- 修改作用范围：`admin_presence:policy:edit_scope:<policy_id>` → `admin_presence:policy:edit_scope_to:<policy_id>:all|account|group`
- 选择账号：`admin_presence:policy:edit_account_to:<policy_id>:<account_id>`
- 选择分组：`admin_presence:policy:edit_group_to:<policy_id>:<group_id>`
- 修改提醒时间：`admin_presence:policy:edit_remind:<policy_id>` → `admin_presence:policy:edit_remind_to:<policy_id>:<minutes>`；也可点「自定义提醒时间」，按按钮选择小时 `0-23` 和分钟 `00/05/10...55`。
- 修改最终动作时间：`admin_presence:policy:edit_final:<policy_id>` → `admin_presence:policy:edit_final_to:<policy_id>:<minutes>`；也可点「自定义最终动作时间」，按按钮选择小时 `0-23` 和分钟 `00/05/10...55`，且必须晚于提醒时间。

点击启用 / 停用 / 编辑时，Telegram 适配层调用 `AdminPresenceService`，并展示中文结果。

Telegram 支持卡片式保活策略中心、查看保活策略详情和新建保活策略：

- 入口：`admin_presence:policy:create`
- 选择最终动作：`admin_presence:policy:create_action:notify` / `admin_presence:policy:create_action:shutdown_all_instances` / `admin_presence:policy:create_action:delete_all_instances`
- 选择作用范围：`admin_presence:policy:create_scope:<action>:all|account|group`
- 选择具体账号：`admin_presence:policy:create_account:<action>:<account_id>`
- 选择具体分组：`admin_presence:policy:create_group:<action>:<group_id>`
- 选择提醒时间：`admin_presence:policy:create_remind:<action>:<scope>:<minutes>`，按钮给出常用预设：30 分钟、1 小时、2 小时、6 小时、12 小时、18 小时、23 小时；也支持「自定义提醒时间」，按按钮选择小时 `0-23` 和分钟 `00/05/10...55`，范围为 `00:05` 到 `23:55`。
- 选择最终动作时间：`admin_presence:policy:create_final:<action>:<scope>:<remind_after_minutes>:<final_after_minutes>`，必须晚于提醒时间；也支持「自定义最终动作时间」，按按钮选择小时 `0-23` 和分钟 `00/05/10...55`，范围为 `00:05` 到 `23:55`，并且必须大于第一段提醒时间。
- 可选最终动作前每小时提醒：`admin_presence:policy:create_hourly:<action>:<scope>:<remind_after_minutes>:<final_after_minutes>:<hourly_before_minutes>`，可选不重复提醒、最终前 3/6/12/24 小时开始每小时提醒
- 输入策略名称后创建

选择 `删除全部服务器` 时会先展示高危警告，但按当前产品规则不会要求第二次文本确认；该策略规则生效后到达触发条件会通过 Cron 直接执行真实批量删除。Telegram 只负责提醒并收集范围、时间和名称，不再做额外的删除确认，所以创建/编辑阶段必须把影响范围、提醒时间、最终动作时间和不可恢复风险说清楚。

管理员保活确认支持 `scope=all`（全部账号）、`account:<account_id>`（单账号）和 `group:<group_id>`（分组）。支持的策略动作是 `notify`、`shutdown_all_instances`、`delete_all_instances`。Cloudflare Cron 会通过 Job Runner 执行到期策略，其中关机 / 删除策略会按策略范围调用批量操作路径；同一周期内同一策略规则只应触发一次。若开启“最终动作前每小时提醒”，系统会在最终动作前指定窗口内生成逐小时 notify 规则，例如最终前 6 小时会在最终动作前 6/5/4/3/2/1 小时各提醒一次。

保活提醒会主动发送 Telegram 消息，并带「立即打卡」按钮；打卡成功后会清理本轮待处理保活提醒，并在打卡结果里展示本次清理数量。保活提醒不走普通消息定时删除，避免用户还没看到按钮就被自动清掉。保活最终动作（批量关机 / 批量删除）执行后也会主动发送结果通知，通知包含策略、动作、范围、距离上次打卡时间、总数、成功、失败、跳过保护、失败详情和审计日志入口。通知发送失败不会影响已经执行的 Linode 操作，也不会导致 Cron 重复执行。

不支持单台实例范围、标签、实例组、网页管理界面、多人管理员或第三方登录。Telegram 不展示 token 明文、`encrypted_token` 或 `rules_json` 原文。当前 Telegram 支持查看详情、新建、编辑、启用、停用和删除保活策略。保活策略列表展示总策略数、启用策略数和高危删机策略数；策略详情用统一的状态、范围、提醒时间、最终动作和触发流程卡片展示。

删除保活策略只删除 Bot 内的策略配置，不会删除 Linode 服务器；真正删除服务器只会发生在实例删除、批量删除或已启用的删除类保活策略到期执行时。

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

时间语义：Telegram 里的“每天 08:50 / 每天 23:05”和用户输入的 `09:30` 都按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）解释。系统内部会把下一次运行时间换算为 UTC ISO 存入 `next_run_at`。


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

Telegram 支持卡片式定时任务中心和快速新增定时任务：

- 入口：`schedules:create`
- 选择动作：`schedules:create:action:boot` / `schedules:create:action:shutdown` / `schedules:create:action:reboot`
- 选择全部账号范围：`schedules:create:scope:<action>:all`
- 选择单账号范围：`schedules:create:scope:<action>:account`
- 选择具体账号：`schedules:create:account:<action>:<account_id>`
- 选择分组范围：`schedules:create:scope:<action>:group`
- 选择具体分组：`schedules:create:group:<action>:<group_id>`
- 选择单台服务器范围：`schedules:create:scope:<action>:instance`
- 选择单台服务器所属账号：`schedules:create:instance_account:<action>:<account_id>`
- 选择具体服务器：`schedules:create:instance:<action>:<account_id>:<instance_id>`
- 选择预设时间：`schedules:create:preset:<action>:all:daily_0850` / `schedules:create:preset:<action>:all:daily_2305`
- 选择单账号预设时间：`schedules:create:preset:<action>:account:<account_id>:daily_0850` / `schedules:create:preset:<action>:account:<account_id>:daily_2305`
- 选择分组预设时间：`schedules:create:preset:<action>:group:<group_id>:daily_0850` / `schedules:create:preset:<action>:group:<group_id>:daily_2305`
- 输入自定义时间：`schedules:create:custom:<action>:all` / `schedules:create:custom:<action>:account:<account_id>` / `schedules:create:custom:<action>:group:<group_id>`

快速新增当前支持 `scope=all`（全部账号）、`scope=account`（单账号）、`scope=group`（分组）和 `scope=instance`（单台服务器），动作支持开机、关机、重启，时间支持两个常用预设：每天 08:50、每天 23:05。也支持输入自定义时间或 Cron：用户可以发送 `09:30` / `23:05` 这类时间，系统会转换为每天执行的 Cron；也可以直接发送 5 段 Cron，例如 `30 9 * * *`。创建时 Telegram 适配层只收集按钮/文本输入并调用 `ScheduleService.createSchedule(...)`，不把定时任务业务逻辑写在 callback 里。

当前支持查看、新增、启用、停用、暂停全部、启用全部、删除定时开机 / 关机 / 重启任务。不支持定时删除服务器。定时任务首页展示支持范围摘要；新增流程按 3 步呈现：选择动作、选择范围、选择执行时间；列表页展示总任务数和启用任务数。

定时任务真正由 Cloudflare Cron 执行后，会主动发送 Telegram 结果通知。通知包含本轮检查任务数、实际执行任务数、失败任务数，以及每个已执行任务的总数、成功、失败、跳过保护和失败详情。通知发送失败不会影响定时任务实际执行，也不会导致 Cron 重复执行。

单台服务器定时任务创建时，Telegram 必须收集 `account_id + instance_id`，并由 `ScheduleService` 校验实例属于该账号。若实例不存在或不属于该账号，应提示用户重新选择，不能创建未来会空跑的任务。

## Callback 交互与防重复点击

所有 Telegram `callback_query` 都应调用 `answerCallbackQuery`，避免客户端按钮一直转圈。`answerCallbackQuery` 只是用户体验确认，不等于授权；权限仍必须依赖 webhook secret、Super Admin 校验和 service 层规则。

高危 callback 需要额外防重复点击 / 防重放策略：

- 删除实例：确认页 + nonce / 过期机制。
- 批量删除：确认页 + nonce / 过期机制。
- 保活 `delete_all_instances` 策略创建/编辑：强警告；按当前产品规则不做额外文本二次确认。
- 未来可扩展到关机 / 重启等高影响操作。

执行成功后应编辑原消息为结果页，不再保留执行按钮；旧消息里的确认按钮应过期或只能使用一次。

## 删除语义

- 删除账号：只软删除 Bot 内账号记录，不删除 Linode 服务器。
- 删除分组：只允许删除空分组，不删除账号或服务器。
- 删除保活策略：只删除 Bot 内策略，不删除服务器。
- 删除实例 / 批量删除 / 删除类保活策略到期执行：会调用 Linode API 删除服务器，属于高危操作。

## Reply Keyboard 与 Inline Keyboard

固定 Reply Keyboard 只放 4 个高频全局入口：第一行「主菜单 / 打卡」，第二行「服务器 / 账号」。主菜单 Inline Keyboard 放 6 个主要入口：「服务器 / 账号 / 打卡 / 定时 / 安全 / 更多」；批量操作、分组、审计、隐私和设置放在「更多」里，避免聊天框下方按钮过多。用户在任意输入流程中点击固定按钮时，应先清理当前 session，再进入对应全局功能。

Inline Keyboard 用于当前页面的局部操作，例如详情、确认、取消、返回、启用、停用、删除等。核心业务逻辑仍应在 Service Layer，Telegram callback 只负责展示、收集输入、调用 service 和渲染结果。

## 隐私清理

更多功能提供「隐私」入口：

```text
callback: menu:privacy
```

设置页也提供「隐私清理」入口：

```text
callback: menu:settings → menu:privacy
```

隐私清理用于设置 Telegram 消息自动删除时间。支持按钮：

- 关闭：`privacy:auto_delete:off`
- 1 分钟：`privacy:auto_delete:1`
- 5 分钟：`privacy:auto_delete:5`
- 15 分钟：`privacy:auto_delete:15`
- 1 小时：`privacy:auto_delete:60`
- 24 小时：`privacy:auto_delete:1440`
- 立即清理一次：`privacy:cleanup_now`

开启后，系统只记录 `chat_id` 和 `message_id`，不记录消息正文。`message_cleanup` 后台任务会删除到期消息；保活提醒属于待处理事项，不纳入普通自动删除，而是在用户打卡后清理本轮提醒。如果需要接近 1 分钟清理，Cloudflare Cron 应配置为每分钟触发。Job Runner 会通过 `jobs.next_run_at` 控制其他任务节奏，避免登录监控、保活监控等任务过于频繁。

Telegram 删除能力受平台规则限制：通常只能删除 48 小时内的消息；私聊中 Bot 可删除自身消息和用户发给 Bot 的消息；群组中需要 Bot 具备删消息权限。

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

## 系统自检 / 诊断中心

设置页提供「系统自检 / 诊断中心」入口：

```text
callback: menu:diagnostics
```

诊断中心展示部署状态、失败检查、缺失/禁用 Jobs、Boot safety 当前模式，以及 Bot 关停待开机实例数量。该页面只展示脱敏摘要，不展示 Token、密钥、`encrypted_token` 或原始 metadata。

## 当前范围限制

当前已支持服务器只读查看、单实例开机、关机、重启、删除、批量操作、Boot safety、protected instance、审计日志菜单、账号安全事件监控 MVP、管理员保活确认、定时开关机/重启、单台服务器定时任务、系统自检/诊断中心和 Cloudflare Cron Job Runner。仍不实现标签、实例组、网页管理界面、多人管理员或第三方登录。


当前支持查看、新增、启用、停用、暂停全部、启用全部、删除定时开机 / 关机 / 重启任务。不支持定时删除服务器。定时任务首页展示支持范围摘要；新增流程按产品向导呈现：第 1 步选择动作，第 2 步选择作用对象，第 3 步选择执行时间。作用对象支持全部账号、单账号、分组和单台服务器；点击「📁 选择分组」后进入分组列表，每个分组一行。每一步都提供明确的「⬅️ 上一步：...」返回按钮，避免用户在选择时间、账号、分组或服务器时迷路。执行时间页提供常用时间「每天 08:50 / 每天 23:05」，也支持像老版 Linode bot 一样通过按钮选择其他时间：先选小时 `00-23`，再选分钟 `00/05/10/.../55`；手输 Cron 仅作为高级入口保留。列表页展示总任务数和启用任务数.


### 定时任务修改

定时任务不是只能新增、启停、删除；已支持从 Telegram 列表进入「详情/修改」后直接修改任务。

- 详情入口：`schedules:detail:<schedule_id>`
- 修改入口：`schedules:edit:<schedule_id>`
- 修改动作：`schedules:edit_action:<schedule_id>` → `schedules:edit_action_to:<schedule_id>:boot|shutdown|reboot`
- 修改范围：`schedules:edit_scope:<schedule_id>` → 全部账号 / 账号 / 分组 / 单台服务器
- 修改时间：`schedules:edit_time:<schedule_id>` → 常用时间或按钮选择小时 / 分钟

修改会调用 `ScheduleService.updateSchedule(...)`，重新校验目标账号 / 分组 / 实例，并在任务启用时重新计算 `next_run_at`。Telegram callback 只负责展示和收集选择，不直接写业务规则。


### Windows Server 创建

服务器管理页提供「🪟 创建 Windows 服务器」。当前开放 Windows Server 2022 稳定路线和 Windows 11 Enterprise LTSC 2024 实验路线：

```text
选择账号
→ 如未配置，先创建/更新当前账号的私有 StackScript
→ 选择 Region
→ 选择满足最低要求的 Plan
→ 选择 Firewall
→ 高危确认
→ 调用 WindowsInstanceService.createWindowsInstance(...)
```

Telegram 不直接实现 Windows 创建业务逻辑，只保存会话状态、展示选项、收集确认并调用 service/API。流程为：选择版本 → Win11 选择语言 zh-cn/en-us → 选择凭据（自动生成强密码或自己输入密码）→ 设置 Linode 实例名称（可跳过自动命名）→ Region → Plan → Firewall → 高危确认。Win11 页面明确提示 Bot 会自动查找官方 ISO，不需要用户输入 ISO URL。创建成功后会显示一次性 Windows 登录用户名、Windows 密码和临时 Ubuntu root 密码；默认用户名为 `Administrator`。Server 2022 预计 15-30 分钟，Win11 预计 20-40 分钟，完成后用 RDP 3389 连接。

当前不接入 kejilion 的通用 DD 菜单，也不使用公开默认密码。后续如扩展 Windows 11 / Server 2025 / DD 镜像，也必须先落 service/API，并保留高危确认、审计日志和一次性密码展示规则。


Windows 密码自定义：Telegram 支持在创建流程中选择“自己输入密码”。系统会校验 10-64 位、大小写字母、数字和符号，禁止空格、中文、XML 特殊字符和明显弱密码；收到后会尝试删除用户发送的密码消息。为降低登录失败风险，用户名默认固定 `Administrator`，API 虽预留 `windows_username`，Telegram 暂不开放自定义用户名。


Linode 实例名称自定义：Windows 创建流程支持输入 Linode label，限制为 3-64 位，只能包含英文、数字、点、下划线、短横线，不支持中文；也可以跳过自动命名。


### Win11 RDP 连接说明

Win11 StackScript 会在 unattend/FirstLogonCommands 中强制开启 RDP、关闭 NLA、放行 TCP 3389，并将 TermService 设置为自动启动。若安装完成后 LISH 能看到桌面但 RDP 仍连接不到登录页，优先检查 Linode Firewall 是否放行 3389、实例公网 IPv4 是否正确，以及 Windows 内 `netstat -ano | findstr :3389` 是否处于 LISTENING。
