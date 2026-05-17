# Session Notes

## 当前状态

项目已部署验证过基础 Cloudflare Worker / D1 / Cron / 一键安装流程。后续重点从“能部署”转为“Telegram Bot 真正好用”。

## 最近关键修复

- 2026-05-15 Phase 1 Telegram 可用性推进：新增固定 Reply Keyboard 渲染能力，支持“主菜单 / 打卡 / 服务器 / 账号”文字入口；主菜单和账号菜单中文化；服务器菜单新增运行中/已关机过滤入口；服务器列表展示第一个 IPv4，详情展示全部 IPv4 且不展示 IPv6；详情页按状态展示中文操作按钮。
- 2026-05-15 账号添加体验推进：账号昵称支持中文、英文、数字、空格、下划线、短横线；Telegram 添加流程改为中文昵称提示；添加成功展示账号、默认分组、Token 状态、服务器数量、安全基线提示。
- 2026-05-15 Token 检测与安全基线：`LinodeClient.testToken` 现在优先调用 `/account`，并尝试读取 `/linode/instances` 与 `/account/logins`；添加账号时记录 `security_baseline_at`、`last_seen_login_id`、`last_login_check_at`，避免后续把添加前历史登录全通知出来。为兼容旧单次 mock 测试，若 `/account` 返回旧 `/profile` 风格 `username`，仍按旧路径兼容。
- 2026-05-15 数据库 schema/migration 增加 `linode_accounts.security_baseline_at`；新增 `tests/phase18-telegram-first-experience.test.ts` 覆盖固定入口、中文账号、安全基线、IPv4 展示和状态按钮。
- 2026-05-15 本地部署准备完成：新增 `.dev.vars.example` 和 `docs/local-dev.md`；已用 Wrangler 本地 D1 执行 `schema.sql` 成功，`npm run dev -- --ip 127.0.0.1 --port 8787` 启动成功；本地 `/api/v1/health`、deployment diagnostics OK；执行 `/api/v1/setup/initialize` 后 jobs diagnostics OK。暂不推 GitHub，后续先本地 Telegram 联调。
- 2026-05-15 Telegram 键盘交互调整：主入口按钮固定在聊天框下方 Reply Keyboard（主菜单 / 打卡 / 服务器 / 账号），不再把主功能菜单铺在每条消息下方；每条重要消息下方保留 `❤️ 打卡保活` Inline Keyboard。已更新相关测试。
- 2026-05-15 修复 Reply Keyboard 快捷按钮与账号添加流程冲突：`主菜单 / 服务器 / 账号 / 打卡` 现在优先按全局快捷入口处理，并清理当前会话状态；点击聊天框下方 `❤️ 打卡` 会直接执行保活打卡，不再被当成账号昵称输入。
- 2026-05-15 优化 Inline 打卡反馈：点击消息下方 `❤️ 打卡` 后直接编辑当前消息为 `✅ 打卡成功` + 最近确认时间，不显示 `current_cycle_id`，也不再继续附带打卡按钮，避免“打卡后又让打卡”的套娃体验。
- 2026-05-15 本轮接手检查：已按要求复读 `README.md`、`docs/PRODUCT_NEXT.md`、`docs/SESSION_NOTES.md`、`docs/prd-and-architecture.md`、`docs/telegram.md`、`docs/api.md`；确认当前未提交改动主要是 Phase 1 Telegram-first 体验。补强点：恢复账号昵称重复校验；运行中服务器详情不再显示无效“开机”按钮；删除按钮改为进入二次确认 `instances:confirm_delete:*`，确认后才调用原删除 service；去掉服务器菜单重复打卡按钮；开始把分组底座接入：新增 groups schema / repository / service / API / Telegram 入口，默认分组“未分组”可见；同步更新删除/开关机/分组相关测试。
- 2026-05-15 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，85 个测试全部通过）。
- 2026-05-15 按用户选择继续 Phase 2 分组菜单补全：分组 service/API 增加重命名、删除空分组、移动账号到分组；Telegram 分组菜单支持查看列表、分组详情、输入式新建分组、输入式重命名、删除空分组二次确认、查看分组下账号、按分组查看服务器；分组相关展示保持中文，业务逻辑仍在 service/repository/API 层。新增/更新 `tests/phase19-groups.test.ts` 覆盖 API/service 与 Telegram 流程。
- 2026-05-15 继续把账号添加流程接入分组选择：添加账号现在维持“输入昵称 → 选择分组 → 输入 Token”的顺序；`accounts:add:group:*` 回调可选分组，账号创建时把 `group_id` 一起写入；默认分组仍是 `未分组`。更新 `tests/phase5-accounts.test.ts` 与 `tests/phase18-telegram-first-experience.test.ts` 覆盖新链路。
- 2026-05-15 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，86 个测试全部通过）。
- 2026-05-16 继续优化分组体验：从账号添加流程里新建分组后，会自动回到账号添加的分组选择页，保留已输入账号昵称；分组下服务器页改用专门渲染，空分组/无服务器有明确中文提示，并提供“返回分组详情”和打卡按钮，不再复用普通服务器管理返回。更新 `tests/phase19-groups.test.ts` 覆盖新建分组回流和空服务器分组。
- 2026-05-16 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，87 个测试全部通过）。
- 一键安装自动建表、初始化默认配置、生成 runtime secrets。
- runtime secrets 不再回退使用 Bot Token。
- 一键安装自动配置 Telegram webhook。
- Telegram webhook 收到消息后必须实际调用 Telegram API 发送消息，不能只返回动作 JSON。
- 支持 `SUPER_ADMIN_TELEGRAM_ID` 主动发送安装成功通知；未设置时仍可首次 `/start` 自动绑定。

## 下一阶段需求来源

详见：`docs/PRODUCT_NEXT.md`。

## 下一阶段核心原则

- API-first / Service-first。
- Telegram 只是展示窗口。
- 业务逻辑不要堆在 Telegram handler。
- 功能拆文件，不要塞成大文件。
- Telegram 用户可见文案和按钮尽量中文。

## 已确认需求

- 一个账号只属于一个分组。
- 默认分组：未分组。
- 添加账号时建立安全基线，历史登录不通知。
- Reply Keyboard 固定：主菜单 / 打卡 / 服务器 / 账号。
- Inline Keyboard 做当前页面操作。
- 保活策略以用户设置为准。
- 其他高危功能需要二次确认。
- 保活策略触发的自动批量删机不需要二次确认，但设置策略时必须强警告。
- 服务器列表和详情展示 IPv4；IPv6 暂不展示。

## 建议开发顺序

1. Telegram 可用性和账号体验。
2. 分组。
3. 安全事件基线和通知优化。
4. 定时任务与保活策略按钮化。

## 每轮开发结束前必须做

```bash
npm run typecheck
npm test
```

并更新：

- `docs/PRODUCT_NEXT.md` 如需求变更
- `docs/SESSION_NOTES.md` 记录完成/下一步/阻塞
- 相关部署/Telegram 文档

## 2026-05-16 Phase 3 安全事件体验优化

- 确认并补强 `SecurityService.checkAccounts` 基线逻辑：账号已有 `last_seen_login_id` 时，只处理 cursor 之后的新登录；Linode 返回列表中 cursor 之前的历史登录不会写入 `login_events`，也不会生成 `security_events`。
- Telegram 安全事件菜单中文化：标题改为 `🛡 安全事件`，菜单按钮改为 `查看未确认 / 查看最近事件 / 手动检查 / ❤️ 打卡`。
- 安全事件列表不再向普通用户裸露 `LOGIN_SUCCESS / LOGIN_FAILED / TOKEN_INVALID / TOKEN_PERMISSION_ERROR`，统一展示为 `成功登录 / 登录失败 / Token 无效 / Token 权限不足`；事件状态也转换为中文展示。
- 未确认事件按钮补齐 `是我 / 不是我 / ❤️ 打卡`，内部 `callback_data` 仍保持英文机器码。
- 点击 `是我` 后展示中文确认状态；点击 `不是我` 后展示中文风险建议，提醒撤销/重置 Token、检查登录记录和服务器状态、修改密码并检查二次验证。
- 补充 `tests/phase12-security-events.test.ts`：覆盖基线前历史登录不生成事件、新登录生成事件、Telegram 安全事件中文按钮、确认/可疑状态更新、风险建议、token/encrypted_token/raw metadata 不泄露。
- 本轮未做保活策略按钮化、定时任务按钮化、分组状态过滤。
- 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，88 个测试全部通过）。

## 2026-05-16 Phase 3 文档同步

- 更新 `docs/telegram.md` 安全事件章节：同步当前真实 Telegram 菜单标题、中文按钮、中文事件类型/状态映射、`是我 / 不是我 / ❤️ 打卡` 操作、确认/可疑状态更新和风险建议。
- 更新 `docs/telegram.md` 记录安全基线规则：添加账号时建立基线，后续只处理 `last_seen_login_id` 之后的新登录，历史登录不通知；明确 Telegram 不展示 token 明文、`encrypted_token`、`raw_json` 或 `metadata_json` 原文。
- 更新 `docs/api.md` Security Events API：补充 `POST /api/v1/security/check` 只保存 cursor 后新登录、历史登录不生成安全事件通知；补充 `raw_json` 不外露和 Telegram 前端会转换内部事件枚举为中文。

## 2026-05-16 Phase 4A 定时任务按钮化

- 定时任务 Telegram 菜单中文化：标题改为 `⏰ 定时任务`，说明中的 `boot / shutdown` 改为 `开机 / 关机`。
- 定时任务列表中文化：动作显示 `开机 / 关机`，范围显示 `全部账号 / 单账号 #id`，状态显示 `启用 / 停用`，下次运行显示为 `下次运行`。
- 每条定时任务新增 Telegram 操作按钮：启用/停用、删除；删除先进入二次确认，再调用 `ScheduleService.deleteSchedule(...)`。
- 新增 Telegram callback：`schedules:enable:<id>`、`schedules:disable:<id>`、`schedules:delete_confirm:<id>`、`schedules:delete:<id>`；callback 只调用 `ScheduleService` 并渲染中文结果，业务逻辑仍在 service/repository/API 层。
- 更新 `tests/phase14-schedules.test.ts` 覆盖定时任务菜单/列表中文化、启用/停用、删除确认、确认删除、审计日志和不泄露 metadata/token。
- 更新 `docs/telegram.md` 定时任务章节，记录当前只支持查看/启用/停用/删除已有任务，暂不在 Telegram 创建定时任务。

## 2026-05-16 Phase 4B 保活策略按钮化

- 保活打卡菜单中文化并隐藏 `current_cycle_id`：Telegram 菜单只展示最近确认时间和启用策略组数量；打卡成功只展示最近确认时间。
- 保活策略列表中文化：`notify` 显示为 `只通知`，`shutdown_all_instances` 显示为 `关闭全部服务器`，`delete_all_instances` 显示为 `删除全部服务器`，`scope=all` 显示为 `全部账号`。
- 每条保活策略新增 Telegram 启用/停用按钮：`admin_presence:policy:enable:<id>` / `admin_presence:policy:disable:<id>`；callback 只调用 `AdminPresenceService.enablePolicy/disablePolicy` 并渲染中文结果。
- 本轮暂不在 Telegram 创建/删除保活策略，避免高危删除策略配置过早按钮化。
- 更新 `tests/phase13-admin-presence.test.ts` 覆盖策略列表中文化、启用/停用 callback、审计日志和不泄露 `rules_json` / token。
- 更新 `docs/telegram.md` 管理员保活确认章节，记录策略启停按钮、中文映射和当前范围限制。
- 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，90 个测试全部通过）。

## 2026-05-16 Phase 4C 保活策略高危创建流程

- Telegram 保活策略列表新增“新建策略”入口，支持选择 `只通知`、`关闭全部服务器`、`删除全部服务器` 三类动作；核心创建仍调用 `AdminPresenceService.createPolicy(...)`。
- 新增保活策略输入流：选择动作后进入输入策略名称；创建成功后展示策略 ID、名称、状态、范围和中文动作。
- 对 `删除全部服务器` 增加强制高危确认：选择该动作后先展示强警告，必须回复精确文本 `确认删除全部服务器` 才进入策略名称输入；确认文字不匹配不会创建策略。
- Telegram callback / message flow 只做展示、收集输入和调用 service，未把保活策略业务逻辑堆进 Telegram 层。
- 更新 `tests/phase13-admin-presence.test.ts` 覆盖新建策略、删除全部服务器强确认、错误确认不创建、critical 审计日志、`rules_json` 不泄露。
- 更新 `docs/telegram.md` 记录保活策略新建入口、高危确认文案和当前仍不支持 Telegram 删除保活策略。
- 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，91 个测试全部通过）。

## 2026-05-16 Phase 3 安全事件体验回归补强

- 复查 `SecurityService.checkAccounts`：当前只基于 `last_seen_login_id` 处理 cursor 之后的新登录；已有测试覆盖 cursor 前历史登录不会写入 `login_events` / `security_events`，新登录会生成安全事件。
- 调整 Telegram 未确认安全事件操作按钮：用户可见按钮改为纯中文 `是我 / 不是我 / ❤️ 打卡`，不再在按钮文本里混入事件编号；`callback_data` 仍保持 `security:confirm:<id>`、`security:suspicious:<id>`、`admin_presence:checkin`。
- 加强 `tests/phase12-security-events.test.ts` 断言：确认安全事件按钮中文、旧 `#id 是我 / #id 不是我` 文案不再出现，并继续验证不泄露 token / encrypted_token / metadata_json。
- 本轮未做保活策略按钮化、定时任务按钮化、分组状态过滤。
- 验证通过：`npm run typecheck`；`npm test`（22 个测试文件，91 个测试全部通过）。

## 2026-05-16 Phase 4D 定时任务快速新增 MVP

- 接手后先跑基线验证：`npm run typecheck` 与 `npm test` 均通过，当前为 22 个测试文件 / 91 个测试全绿。
- 补齐 Telegram 定时任务菜单的“新增任务”入口：`schedules:create`。
- 新增 Telegram 快速创建流程：选择 `开机 / 关机`，再选择 `每天 08:00 / 每天 22:00`；当前范围固定为 `全部账号`，创建时调用 `ScheduleService.createSchedule(...)`，Telegram callback 只负责收集按钮选择和渲染中文结果。
- 新增 callback：`schedules:create:action:<boot|shutdown>`、`schedules:create:preset:<action>:daily_0800|daily_2200`。
- 更新 `tests/phase14-schedules.test.ts` 覆盖新增任务入口、动作/时间中文按钮、创建成功文案、审计日志和不泄露 metadata/token。
- 更新 `docs/telegram.md` 和 `docs/PRODUCT_NEXT.md`，记录当前快速新增只支持全部账号 + 两个常用时间预设，单账号/分组/单台服务器/自定义 Cron/重启仍是后续任务。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，4 个测试通过）。

## 2026-05-16 Phase 4E 定时任务单账号创建流程

- 在快速新增 MVP 基础上继续补齐 Telegram 范围选择：`全部账号 / 选择账号`。
- 新增单账号创建链路：选择动作 → 选择账号范围 → 选择具体账号 → 选择每天 08:00 / 每天 22:00 → 调用 `ScheduleService.createSchedule(...)` 创建 `scope=account` 定时任务。
- 新增/调整 callback：`schedules:create:scope:<action>:all|account`、`schedules:create:account:<action>:<account_id>`、`schedules:create:preset:<action>:all:<preset>`、`schedules:create:preset:<action>:account:<account_id>:<preset>`。
- Telegram 账号选择只展示账号 ID 和昵称，不展示 token / encrypted_token；核心创建逻辑仍复用 service/API/storage 层。
- 更新 `tests/phase14-schedules.test.ts` 覆盖单账号选择、单账号预设时间、创建成功文案、审计日志和敏感信息不泄露。
- 更新 `docs/telegram.md` 和 `docs/PRODUCT_NEXT.md`：当前 Telegram 快速新增支持全部账号或单账号 + 每天 08:00 / 22:00；分组、单台服务器、自定义 Cron、重启仍是后续任务。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，5 个测试通过）。

## 2026-05-16 Phase 4F 定时任务自定义时间 / Cron 输入

- 在定时任务快速新增流程里补充“自定义时间”按钮：`schedules:create:custom:<action>:all` / `schedules:create:custom:<action>:account:<account_id>`。
- 新增消息输入流状态 `creating_schedule_custom_time`：用户可发送 `09:30` / `22:00` 这类每天固定时间，系统转换为 `30 9 * * *` / `0 22 * * *`；也可直接发送 5 段 Cron，例如 `30 6 * * *`。
- 自定义输入创建仍调用 `ScheduleService.createSchedule(...)`；Telegram message flow 只解析用户输入、设置/清理 bot session、渲染中文结果。
- 输入格式错误时保留会话并提示中文错误；发送 `/cancel` 可取消。
- 更新 `tests/phase14-schedules.test.ts` 覆盖自定义时间、自定义 Cron、错误输入保留会话、创建后清理会话、审计日志和敏感信息不泄露。
- 更新 `docs/telegram.md` 和 `docs/PRODUCT_NEXT.md`，记录当前支持固定时间和 5 段 Cron 输入。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，6 个测试通过）。

## 2026-05-16 Phase 5A 批量操作二次确认

- 批量操作菜单文案更新：不再提示“立即执行 / 不做二次确认”，改为关机和删除会先确认。
- Telegram 单账号批量操作从 `batch:account:<action>:<account_id>` 改为先展示确认页；确认后才进入 `batch:account:run:<action>:<account_id>` 执行。
- Telegram 全部账号批量操作从 `batch:all:<action>` 改为先展示确认页；确认后才进入 `batch:all:run:<action>` 执行。
- 删除类操作确认页显示高危警告：批量删除服务器不可恢复；确认按钮显示“确认删除”。关机/开机显示“确认执行”。
- 批量结果展示中文化：动作显示 `开机 / 关机 / 删除`，范围显示 `全部账号 / 单账号`，结果显示 `全部成功 / 部分失败 / 全部失败`。
- 核心执行仍只调用 `BatchService.runAccountBatch(...)` / `runAllAccountsBatch(...)`，Telegram callback 只负责确认页和中文渲染。
- 更新 `tests/phase11-batch-operations.test.ts` 覆盖确认页、删除高危警告、确认后执行、不泄露 token/encrypted_token。
- 更新 `docs/telegram.md` 记录新的确认 callback 和二次确认规则。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase11-batch-operations.test.ts`（1 个测试文件，4 个测试通过）。

## 2026-05-16 Phase 5B 分组批量 API / Service 底座

- 按 API-first 原则补分组批量能力：核心先落在 `BatchService.runGroupBatch(...)`，再暴露 HTTP API，最后接 Telegram 展示入口。
- 新增 API：`POST /api/v1/groups/:group_id/instances/batch/boot|shutdown|delete`，只处理该分组下 active 账号的实例。
- `BatchService` 新增 `scope=group`，按 `linode_accounts.group_id` 过滤账号后复用统一 targets 执行路径；审计仍按每台实例写 `batch.boot/shutdown/delete`。
- 分组详情页新增中文按钮：`分组批量开机 / 分组批量关机 / 分组批量删除`。
- Telegram 分组批量操作沿用 Phase 5A 二次确认：`batch:group:<action>:<group_id>` 先确认，`batch:group:run:<action>:<group_id>` 才执行；删除显示高危警告。
- 更新 `tests/phase11-batch-operations.test.ts` 覆盖分组批量 API、Telegram 分组详情按钮、分组批量确认、确认后执行和敏感信息不泄露。
- 更新 `docs/api.md` 和 `docs/telegram.md` 记录分组批量 API / callback。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase11-batch-operations.test.ts`（1 个测试文件，5 个测试通过）。

## 2026-05-16 Phase 5C 定时任务分组范围

- 按 API-first 原则扩展定时任务核心能力：`ScheduleService` 的 `scope` 从 `all|account` 扩展为 `all|account|group`，新增 `group_id`。
- `power_schedules` schema / 初始 migration 增加 `group_id` 外键，并新增增量迁移 `migrations/0002_power_schedules_group_scope.sql` 兼容已有部署。
- `SchedulesRepository` create/list/get 支持读写 `group_id`；`ScheduleService.runDueSchedules` 在 `scope=group` 时调用 `BatchService.runGroupBatch(...)`，复用分组批量底座。
- `POST /api/v1/schedules` 支持创建 `scope=group` 的定时开机/关机任务，例如 `{ action, scope: "group", group_id, cron_expr }`。
- Telegram 定时任务创建流程新增“选择分组”：选择动作 → 选择分组范围 → 选择具体分组 → 预设时间或自定义时间/Cron → 调用 `ScheduleService.createSchedule(...)`。
- 新增/调整 callback：`schedules:create:scope:<action>:group`、`schedules:create:group:<action>:<group_id>`、`schedules:create:preset:<action>:group:<group_id>:daily_0800|daily_2200`、`schedules:create:custom:<action>:group:<group_id>`。
- 更新 `tests/phase14-schedules.test.ts` 覆盖 Telegram 分组范围创建；更新 `tests/phase15-job-runner.test.ts` fake 数据结构兼容 group scope；更新 `docs/api.md` / `docs/telegram.md`。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts tests/phase15-job-runner.test.ts`（2 个测试文件，9 个测试通过）。

## 2026-05-16 Phase 6A 账号管理补全

- 按 API-first 原则补账号详情能力：`AccountService.getAccount(...)` 返回公开账号详情，新增 `GET /api/v1/accounts/:account_id`，不返回 token 明文或 `encrypted_token`。
- Telegram 账号列表为每个账号增加“详情”按钮，进入 `accounts:detail:<account_id>`。
- 账号详情页展示账号状态、Token 状态、Token 指纹、分组、安全基线时间、创建/更新时间，并提供 `测试 Token / 移动分组 / 删除账号 / 返回账号列表 / ❤️ 打卡`。
- 新增 Telegram callback：`accounts:test:<id>` 调用 `AccountService.testAccount(...)`；`accounts:delete_confirm:<id>` 展示删除二次确认；`accounts:delete:<id>` 调用 `AccountService.deleteAccount(...)`；`accounts:move_group:<id>` / `accounts:move_group_to:<id>:<group_id>` 调用 `GroupService.moveAccountToGroup(...)`。
- 删除账号确认文案明确：不会删除 Linode 服务器，但该账号不再参与本 Bot 的服务器管理、批量操作、定时任务和安全检查。
- 更新 `tests/phase5-accounts.test.ts` 覆盖账号详情 API、Telegram 账号详情、Token 测试、移动分组、删除二次确认、不泄露 token/encrypted_token。
- 更新 `docs/api.md` 和 `docs/telegram.md` 记录账号管理 API / Telegram 流程。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase5-accounts.test.ts`（1 个测试文件，7 个测试通过）。

## 2026-05-16 Phase 6B 账号 Token 更新补全

- 新增 `AccountsRepository.updateToken(...)`，支持更新账号加密 Token、Token 指纹、Token 状态和安全检查基线字段。
- 新增 `AccountService.updateAccountToken(...)`：先测试新 Token，成功后加密保存并重新建立 `last_seen_login_id` / `last_login_check_at` / `security_baseline_at`，避免旧历史登录在换 Token 后误报。
- 新增 API：`PUT /api/v1/accounts/:account_id/token`，请求体 `{ "token": "..." }`；响应只返回公开账号信息，不返回 token 明文或 `encrypted_token`。
- Telegram 账号详情增加「更新 Token」按钮：`accounts:update_token:<account_id>`，进入 `updating_account_token` 会话；用户发送新 Token 后会尝试删除 Token 消息，并调用 service 更新，不在回复中回显 Token。
- 补充测试覆盖 API Token 更新、Telegram Token 更新、不泄露新 Token / `encrypted_token`、更新后 audit log。
- 更新 `docs/api.md` 和 `docs/telegram.md`。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase5-accounts.test.ts`（1 个测试文件，8 个测试通过）。

## 2026-05-16 Phase 6C 定时任务暂停全部 / 启用全部

- 为 `ScheduleService` 增加批量状态切换：`enableAllSchedules(...)` / `disableAllSchedules(...)`，底层由 `SchedulesRepository.enableAll()` / `disableAll()` 处理未删除任务。
- 新增 API：`POST /api/v1/schedules/disable-all` / `POST /api/v1/schedules/enable-all`，返回本次受影响任务数和任务列表，并分别写入 `schedule.disable_all` / `schedule.enable_all` 审计。
- Telegram 定时任务菜单增加 `暂停全部 / 启用全部`；暂停全部先进入二次确认页，再执行批量停用。
- `schedules:disable_all_confirm` 展示高危提醒；`schedules:disable_all` 和 `schedules:enable_all` 调用 service 并展示中文结果。
- 补充 `tests/phase14-schedules.test.ts` 覆盖批量暂停/启用 API 和 Telegram 菜单。
- 更新 `docs/api.md` 与 `docs/telegram.md`。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，7 个测试通过）。

## 2026-05-16 Phase 7A 服务器体验继续补强

- 在 `InstanceService` 公开账号时补充 `group_name`，让服务器列表 / 详情页可以稳定展示账号所属分组名称。
- 服务器详情页补充分组信息，并把返回链路补顺：详情页可直接回到账号服务器、分组服务器或服务器管理主菜单。
- 服务器列表页的返回按钮根据来源自适应，账号列表 / 分组列表能更自然地回到上一层，而不是只能回总菜单。
- 更新 `tests/phase6-instances.test.ts` 和 `tests/phase7a-readonly-experience.test.ts`，覆盖分组名展示、详情返回链路和列表分组文案。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase6-instances.test.ts`（1 个测试文件，4 个测试通过）。

## 2026-05-16 Phase 8A 保活策略配置完善

- 按 API-first 原则扩展 `AdminPresenceService.createPolicy(...)`：新增 `remind_after_minutes` / `final_after_minutes` 输入校验，最终动作时间必须晚于提醒时间。
- 保活策略 `rules_json` 改为两段式规则：先按提醒时间触发 `notify`，再按最终动作时间触发 `shutdown_all_instances` / `delete_all_instances`；只通知策略仅生成提醒规则。对旧 `{ action }` 格式保持兼容解析。
- Telegram 新建保活策略流程调整为：选择最终动作 → 选择提醒时间 → 选择最终动作时间 → 输入名称；`delete_all_instances` 只保留高危警告，不再要求第二次文本确认。
- Telegram 策略列表/启停/创建结果展示提醒时间、最终动作时间、最终动作，并保留删除策略单独的二次确认入口：`admin_presence:policy:delete_confirm:<id>` → `admin_presence:policy:delete:<id>`。
- 更新 `docs/api.md` 和 `docs/telegram.md`，记录提醒时间 / 最终动作时间、两段式规则、删除策略能力和高危确认流程。
- 本轮暂不做 Web 后台、账号/分组作用范围；保活策略仍保持 `scope=all`。

## 2026-05-16 Phase 8B 保活策略作用范围

- 按 API-first / Service-first 原则扩展保活策略作用范围：`AdminPresenceService.createPolicy(...)` 支持 `scope=all`、`scope=account` + `account_id`、`scope=group` + `group_id`，内部保存为 `all` / `account:<id>` / `group:<id>`，并校验账号 active、分组存在。
- `PublicAdminPresencePolicy` 增加 `scope_type`、`account_id`、`group_id`，继续不返回 `rules_json`、token 或 `encrypted_token`。
- Job Runner 执行保活最终动作时按 `policy.scope` 分派：全部账号调用 `BatchService.runAllAccountsBatch(...)`，单账号调用 `runAccountBatch(...)`，分组调用 `runGroupBatch(...)`，避免策略触发误操作范围外账号。
- Telegram 新建保活策略流程增加作用范围选择：选择最终动作 → 选择范围（全部账号 / 账号 / 分组）→ 选择具体账号或分组 → 选择提醒时间 → 选择最终动作时间 → 输入名称；`delete_all_instances` 仍只显示高危警告，不要求额外文本二次确认。
- 更新 `docs/api.md`、`docs/telegram.md`、`docs/PRODUCT_NEXT.md`，同步保活策略范围从仅全部账号扩展为全部账号 / 单账号 / 分组。
- 新增/更新 `tests/phase13-admin-presence.test.ts` 和 `tests/phase15-job-runner.test.ts`，覆盖 Telegram 范围选择、API 文档、Cron 按分组范围执行删除且不触碰范围外账号。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase13-admin-presence.test.ts tests/phase15-job-runner.test.ts`（2 个测试文件，9 个测试通过）。

## 2026-05-16 Phase 8C 保活策略详情页

- 为保活策略补了单条详情能力：新增 `AdminPresenceService.getPolicy(...)`、`GET /api/v1/admin-presence/policies/:policy_id`，返回公开策略详情、解析后的 `rules`、`scope_type`、`account_id` / `group_id`、提醒时间和最终动作时间，不返回 `rules_json` 原文。
- Telegram 策略列表每条新增“详情”按钮：`admin_presence:policy:detail:<policy_id>`；详情页展示策略名称、状态、范围、提醒时间、最终动作时间、创建/更新时间，并提供启用 / 停用 / 删除 / 返回列表 / ❤️ 打卡。
- 启用 / 停用后的反馈页也提供“查看详情”入口，减少列表页按钮拥挤，方便后续继续做编辑入口。
- 更新 `docs/api.md`、`docs/telegram.md`、`tests/phase13-admin-presence.test.ts`，覆盖详情 API、详情按钮、详情页文案和不泄露 `rules_json`。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase13-admin-presence.test.ts tests/phase15-job-runner.test.ts`（2 个测试文件，9 个测试通过）。

## 2026-05-17 本地 Telegram 实机联调

- 复跑验证：`npm run typecheck`、`npm test`、`npm run build:upload` 均通过；当前测试为 22 个测试文件 / 100 个测试全绿。
- 本地 Worker 使用 `.dev.vars` 启动在 `127.0.0.1:8787`，健康检查 `/api/v1/health` OK；Cloudflare quick tunnel 已连到当前 Telegram webhook。
- 通过 Telegram webhook 模拟真实私聊消息验证 `/start` 可实际调用 Telegram API 发出消息，Bot 返回固定 Reply Keyboard 和主菜单；已真实发送到测试 Bot 会话。
- 验证主入口文字：`📁 分组`、`⏰ 定时任务`、`🛡 安全事件`、`❤️ 保活打卡`、`🖥 服务器`、`👤 账号` 均返回对应中文菜单，不再落到 `/help`。
- 验证常用 callback：`schedules:create`、`schedules:list`、`groups:list`、`admin_presence:policies`、`security:events:open` 均返回对应页面。
- 联调中发现旧本地 D1 只执行过旧 schema，缺少 `groups` 表和 `linode_accounts.group_id`，已在本地补齐；生产/新部署应使用最新 `schema.sql` / `migrations/0001_initial.sql`，旧部署需要执行兼容迁移。
- 联调中发现 `⏰ 定时任务` 等主菜单文字入口未映射，已修复 `src/telegram/commands.ts`，新增测试覆盖，并提交推送：`156dfe5 Handle Telegram text menu entries`。
