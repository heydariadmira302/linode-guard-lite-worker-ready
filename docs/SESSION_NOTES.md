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
- 新增 Telegram 快速创建流程：选择 `开机 / 关机`，再选择 `每天 08:50 / 每天 23:05`；当前范围固定为 `全部账号`，创建时调用 `ScheduleService.createSchedule(...)`，Telegram callback 只负责收集按钮选择和渲染中文结果。
- 新增 callback：`schedules:create:action:<boot|shutdown>`、`schedules:create:preset:<action>:daily_0850|daily_2305`。
- 更新 `tests/phase14-schedules.test.ts` 覆盖新增任务入口、动作/时间中文按钮、创建成功文案、审计日志和不泄露 metadata/token。
- 更新 `docs/telegram.md` 和 `docs/PRODUCT_NEXT.md`，记录当前快速新增只支持全部账号 + 两个常用时间预设，单账号/分组/单台服务器/自定义 Cron/重启仍是后续任务。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，4 个测试通过）。

## 2026-05-16 Phase 4E 定时任务单账号创建流程

- 在快速新增 MVP 基础上继续补齐 Telegram 范围选择：`全部账号 / 选择账号`。
- 新增单账号创建链路：选择动作 → 选择账号范围 → 选择具体账号 → 选择每天 08:50 / 每天 23:05 → 调用 `ScheduleService.createSchedule(...)` 创建 `scope=account` 定时任务。
- 新增/调整 callback：`schedules:create:scope:<action>:all|account`、`schedules:create:account:<action>:<account_id>`、`schedules:create:preset:<action>:all:<preset>`、`schedules:create:preset:<action>:account:<account_id>:<preset>`。
- Telegram 账号选择只展示账号 ID 和昵称，不展示 token / encrypted_token；核心创建逻辑仍复用 service/API/storage 层。
- 更新 `tests/phase14-schedules.test.ts` 覆盖单账号选择、单账号预设时间、创建成功文案、审计日志和敏感信息不泄露。
- 更新 `docs/telegram.md` 和 `docs/PRODUCT_NEXT.md`：当前 Telegram 快速新增支持全部账号或单账号 + 每天 08:50 / 23:05；分组、单台服务器、自定义 Cron、重启仍是后续任务。
- 验证通过：`npm run typecheck`；`npm test -- tests/phase14-schedules.test.ts`（1 个测试文件，5 个测试通过）。

## 2026-05-16 Phase 4F 定时任务自定义时间 / Cron 输入

- 在定时任务快速新增流程里补充“自定义时间”按钮：`schedules:create:custom:<action>:all` / `schedules:create:custom:<action>:account:<account_id>`。
- 新增消息输入流状态 `creating_schedule_custom_time`：用户可发送 `09:30` / `23:05` 这类每天固定时间，系统转换为 `30 9 * * *` / `0 22 * * *`；也可直接发送 5 段 Cron，例如 `30 6 * * *`。
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
- 新增/调整 callback：`schedules:create:scope:<action>:group`、`schedules:create:group:<action>:<group_id>`、`schedules:create:preset:<action>:group:<group_id>:daily_0850|daily_2305`、`schedules:create:custom:<action>:group:<group_id>`。
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
- Telegram 新建保活策略流程增加作用范围选择：选择最终动作 → 选择范围（全部账号 / 账号 / 分组）→ 选择具体账号或分组 → 选择提醒时间 → 选择最终动作时间 → 输入名称；`delete_all_instances` 只显示高危警告，不要求额外文本二次确认。
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

## 2026-05-17 Phase 8D 保活策略编辑

- 按 API-first / Service-first 原则补齐保活策略编辑：新增 `AdminPresenceService.updatePolicy(...)` 和 `AdminPresenceRepository.updatePolicy(...)`，支持局部更新名称、启用状态、最终动作、作用范围、提醒时间、最终动作时间。
- 新增 API：`PATCH /api/v1/admin-presence/policies/:policy_id`，响应继续只返回公开策略字段和解析后的规则，不返回 `rules_json`、token 明文或 `encrypted_token`；写入 `admin_presence.policy.update` 审计日志。
- Telegram 策略详情页新增「编辑」入口；支持修改名称、最终动作、作用范围（全部账号 / 单账号 / 分组）、提醒时间、最终动作时间。选择 `删除全部服务器` 时仍展示高危警告。
- 更新 `docs/api.md`、`docs/telegram.md`、`tests/phase13-admin-presence.test.ts`，覆盖 API 编辑、Telegram 编辑入口、名称编辑、动作/范围/时间编辑、审计日志和敏感信息不泄露。

## 2026-05-17 旧 D1 迁移兜底 / 生产部署预检

- 为旧 D1 数据库补兼容迁移脚本：`migrations/0002_legacy_group_compat.sql`，用于早期 schema 已有 `linode_accounts` / `power_schedules`、但没有 `groups` 表和 `linode_accounts.group_id` 的部署；脚本会创建默认分组「未分组」并补账号分组字段。
- 将原 `migrations/0002_power_schedules_group_scope.sql` 改名为 `migrations/0003_power_schedules_group_scope.sql`，用于已有分组/账号分组字段但缺少 `power_schedules.group_id` 的中间版本升级。
- 本地用独立 Wrangler D1 smoke 环境模拟旧 schema：先创建旧 `linode_accounts` / `power_schedules`，再依次执行 `0002_legacy_group_compat.sql` 和 `0003_power_schedules_group_scope.sql`，验证默认分组、旧账号 `group_id=1`、旧定时任务 `group_id=NULL` 均正确。
- 复跑验证：`npm run typecheck`、`npm test`、`npm run build:upload` 均通过；当前 22 个测试文件 / 100 个测试全绿。
- 正式 Cloudflare 部署验证暂时阻塞：当前运行环境没有 `CLOUDFLARE_API_TOKEN`，Wrangler 在非交互环境无法执行 `d1 list` / remote migration / deploy。拿到 Cloudflare API Token 或已登录 Wrangler 后，继续执行 remote D1 schema 检查、按实际缺失列选择迁移、部署 Worker、验证 `/api/v1/health`、diagnostics、Telegram webhook 与 Cron。

## 2026-05-17 Phase 9A 定时任务重启 / 单台服务器范围

- 扩展定时任务核心模型：`ScheduleAction` 从 `boot|shutdown` 扩展为 `boot|shutdown|reboot`，`ScheduleScope` 增加 `instance`；`power_schedules` / `schedule_runs` 增加 `instance_id`，并新增迁移 `migrations/0004_power_schedules_instance_scope.sql`。
- `ScheduleService.createSchedule(...)` 支持 `scope=instance` + `account_id` + `instance_id`；Job Runner 执行单台范围时复用 `BatchService.runAccountBatch(..., { instanceIds: [instance_id] })`，避免影响同账号其他服务器。
- `BatchService` 增加 `reboot` 动作支持，Cron 触发的定时重启会调用 Linode reboot API，并按原批量执行路径写审计日志。
- Telegram 定时任务创建流程新增「重启」动作和「选择单台服务器」范围：选择动作 → 选择单台服务器 → 选择账号 → 拉取服务器列表 → 选择实例 → 预设时间或自定义时间/Cron。
- 更新 `docs/api.md`、`docs/telegram.md` 和 `tests/phase14-schedules.test.ts`，覆盖 API 创建单台重启、Telegram 单台服务器重启预设、自定义时间/Cron、敏感信息不泄露。
- 验证通过：`npm run typecheck`；`npm test`（22 个测试文件 / 101 个测试通过）。

## 2026-05-18 上线前安全审计文档同步

- 本轮目标是文档同步，不改业务代码，不输出任何 secret。
- 审计确认当前验证基线为：`npm run typecheck`、`npm test`、`npm run build:upload` 需要作为上线前检查项。
- 文档已记录上线前高优先级修复项：
  1. `setup initialize` 默认不返回 `API_AUTH_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `LINODE_TOKEN_ENCRYPTION_KEY` 明文；如未来支持 reveal，只能是显式一次性 reveal。
  2. `BatchService` 传入 `instanceIds` 后匹配为空不能返回 `success total=0`，应返回失败或明确错误。
  3. `ScheduleService.createSchedule(...)` 创建 `account` / `group` / `instance` scope 时必须校验目标存在；`instance` scope 必须校验实例属于指定账号。
  4. legacy D1 migrations (`0002` / `0003` / `0004`) 必须先 schema inspect，避免重复执行 `ALTER TABLE ADD COLUMN`。
  5. Telegram callback 需要 `answerCallbackQuery`；删除实例、批量删除等高危 callback 需要确认、nonce、过期、防重放；保活 `delete_all_instances` 按当前产品规则只做强警告，不做额外文本二次确认。
- 文档同步强调：删除账号不会删除服务器；删除分组只允许空分组且不删除账号/服务器；删除保活策略只删除策略配置；删除实例 / 批量删除 / 删除类保活策略到期执行才会真实删除服务器。
- 仍建议后续实现 protected instance，尤其是在启用批量删除或保活自动删机前。

## 2026-05-23 Cron 防重复与 Setup 密钥展示收紧

- 按审计结论优先修复两项上线风险：Cron/Job Runner 防重复执行、Setup runtime secrets 默认不展示。
- `jobs` schema 增加 `locked_until` / `locked_by` / `lock_started_at`，`JobRunnerService` 执行每个系统 job 前先抢占短 TTL 锁，抢不到时跳过，避免 Cloudflare Cron 重叠/重试导致同一 job 并发执行。
- `ScheduleService.runDueSchedules` 增加 due schedule CAS claim：执行前基于旧 `next_run_at` 原子推进下一次运行时间，抢占失败则跳过，避免同一个定时任务被并发 cron 重复开机/关机/重启。
- 保活策略执行顺序改为先创建 `admin_presence_policy_runs` running 记录，占用 `(policy_id, rule_id, cycle_id)` 唯一键；抢占失败直接跳过；执行完成后更新 status/summary/error_code。notify 规则也会记录 run，避免同周期重复提醒。
- 新增 `migrations/0005_job_locks.sql`，旧 D1 需确认 `jobs.locked_until` / `locked_by` / `lock_started_at` 不存在时再执行。
- `/setup` 页面升级为 one-click-setup-v5，默认不再请求 `reveal_runtime_secrets`，初始化结果不展示 runtime secrets。
- 即使 API 显式请求 `reveal_runtime_secrets=true`，后端也只在首次创建 `api_auth_token` 时返回 API token；不返回 `TELEGRAM_WEBHOOK_SECRET` 或 `LINODE_TOKEN_ENCRYPTION_KEY` 原文。
- 补充 `tests/phase15-job-runner.test.ts` 和 `tests/phase4-setup-diagnostics.test.ts` 覆盖 job lock、schedule claim、policy run 记录、setup 默认不 reveal、显式 reveal 不泄露 webhook/encryption key。


## 2026-05-23 Timezone-aware 定时任务

- `ScheduleService.computeNextRunAt` 现在支持 timezone 参数，按 schedule 保存的 IANA 时区解释 Cron 字段，而不是固定按 UTC 解释。
- 新建任务时使用 `timezone` / `APP_TIMEZONE` 计算首次 `next_run_at`；Cron Job 执行后也使用该 schedule 的 timezone 计算下一次运行时间。
- Telegram 预设和自定义时间仍保存为用户本地语义的 Cron，例如 `0 22 * * *` + `Asia/Shanghai`，实际 `next_run_at` 会落到对应 UTC 时间（上海 23:05 = UTC 14:00）。
- 补充测试覆盖 `Asia/Shanghai` 下 23:05、09:30 的 UTC 换算，以及 Telegram 创建任务后的 `next_run_at`。


## 2026-05-23 Account / Group list hardening

- 修复账号列表兼容性：账号读取、分组计数、移动分组等路径统一把旧库/异常数据中的空 `linode_accounts.status` 按 `active` 处理，避免“账号已添加但账号列表为空/分组账号数不对”。
- HTTP `POST /api/v1/accounts` 现在接受可选 `group_id`，API 创建账号也能直接进入指定分组；Telegram 添加账号流程继续调用同一 `AccountService`。
- Telegram 账号列表和详情现在展示中文状态、Token 状态，以及分组名称，便于确认账号是否进了正确分组。
- 补充测试：API 按分组创建账号、账号列表展示分组信息、旧数据空 status 仍能显示。


## 2026-05-23 Login notification baseline fix

- 修复登录监控历史补发：`SecurityService` 现在同时使用 `last_seen_login_id` 和 `security_baseline_at` / `last_login_check_at` 过滤登录记录。即使旧账号缺少 cursor，只要有安全基线时间，也不会把基线之前或等于基线时间的登录历史补发。
- `LinodeClient.testToken` 建立账号安全基线时不再假设 `/account/logins` 第一条就是最新登录，而是按 `datetime` 选择最新登录 ID，避免 Linode 返回顺序异常导致 cursor 建错。
- 补充回归测试：legacy account 有 baseline 但无 cursor 时，只生成 baseline 之后的新登录事件。


## 2026-05-23 Admin presence UX cleanup

- 优化保活打卡 Telegram 体验：打卡成功后不再停在无按钮页面，增加“查看保活状态 / 查看策略组 / 返回主菜单”。
- 保活策略创建/编辑流程补齐取消、返回选择范围、返回策略详情、返回策略组等按钮；输入策略名称时也有“取消创建”。
- 点击打卡会清理当前 Bot 会话，避免旧的创建/编辑策略状态残留，后续文字被误当成策略名称。
- 账号/分组为空时，保活策略范围选择页提供“去添加账号 / 去新建分组”入口。

## 2026-05-23 Boot safety and diagnostics center

- 借鉴老版 `linode-guard-bot` 的 `BOOT_MODE=bot_managed_only` 思路，Worker Lite 新增 Boot safety：默认 `app_settings.boot_safety_mode=bot_managed_only`，批量/定时开机只会开机上次由本 Bot 成功关停的实例，避免误开用户手动关机的机器。
- 新增 `bot_managed_instances` 表、`migrations/0006_bot_managed_instances.sql` 和 `BotManagedInstancesRepository`，记录 `account_id + instance_id` 的最近 Bot 电源动作；成功关机记录为 `shutdown`，成功开机记录为 `boot`，成功删除记录为 `delete`。
- `BatchService` 统一执行 Boot safety 过滤；`ScheduleService` 通过 `BatchService` 执行定时开机，因此自动继承同一安全策略。单台 `InstanceService` 开机/关机/删除也同步更新 Bot managed 状态。
- 新增 `AppSettingsService` 管理 `app_settings`，包含 `boot_safety_mode`，默认值为 `bot_managed_only`；可扩展到未来设置页。
- 诊断中心增强：`GET /api/v1/diagnostics/deployment` 返回脱敏 `app_settings` 摘要和 Boot safety 状态（模式、Bot 关停待开机实例数量）；Telegram `menu:diagnostics` 展示“系统自检 / 诊断中心”、失败检查、Jobs 状态和 Boot safety 摘要。
- 补充测试：批量开机默认只开机 Bot 关停实例；deployment diagnostics 返回 Boot safety 摘要；Telegram 诊断中心显示 Boot safety。更新 README、API 文档、Telegram 文档。

## 2026-05-26 Protected instance / 高危确认收口

- 补齐 App settings HTTP API：`GET /api/v1/app/settings`、`PATCH /api/v1/app/settings`、`POST /api/v1/app/protected-instances`、`DELETE /api/v1/app/protected-instances/:index`，用于读取/更新 `app_settings` 和保护实例规则。
- Telegram 保护实例页面补强：说明保护实例会跳过批量关机/批量删除/保活最终动作，单台关机/删除会被拦截；移除保护规则改为先进入二次确认，避免误移除。
- 单台服务器关机改为先进入确认页：`instances:confirm_shutdown:<account_id>:<instance_id>` → `instances:shutdown:<account_id>:<instance_id>`。
- 单台关机/删除命中 protected instance 时，不再只显示通用错误，而是展示中文拦截说明，并提供“查看保护实例 / 返回服务器详情”。
- 批量删除继续使用二段确认：先“我知道风险，继续”，再要求发送精确文本 `DELETE` 才执行；测试同步为新流程。
- 文档同步：`docs/api.md` / `docs/telegram.md` 不再声称 protected instance 未实现，改为记录当前能力、`result=skipped` 语义和 Telegram 高危确认流程。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase9-instance-delete.test.ts tests/phase11-batch-operations.test.ts tests/phase3-telegram.test.ts`（3 个测试文件，20 个测试通过）。

## 2026-05-26 Telegram 底部按钮和分组添加账号体验

- 简化固定 Reply Keyboard：聊天框下方只保留 4 个高频入口「🏠 主菜单 / ❤️ 打卡 / 🖥 服务器 / 👤 账号」，批量操作和更多功能继续放在主菜单 / 更多功能 Inline Keyboard 内，避免底部按钮过多挤占聊天框。
- 分组详情和分组账号页的「添加账号」改为「添加账号到本组」，callback 使用 `accounts:add:to_group:<group_id>`。
- 从分组入口添加账号时，账号添加会话保存 `preset_group_id`；输入昵称后分组选择页会显示“当前推荐：<分组名>”，并把推荐分组排在第一位标记 `✅`。最终仍通过 `AccountService.createAccount(..., { group_id })` 写入对应分组，保持 API-first / Service-first。
- 从账号菜单普通添加账号仍保持“输入昵称 → 选择分组 / 新建分组 → 输入 Token”的流程。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase3-telegram.test.ts tests/phase18-telegram-first-experience.test.ts tests/phase19-groups.test.ts tests/phase5-accounts.test.ts`（4 个测试文件，28 个测试通过）。

## 2026-05-26 保活策略 24 小时内按钮式自定义时间

- 按用户确认的方案 B 调整保活策略时间选择：保活策略创建/编辑不再要求输入总分钟数，改为“常用快捷按钮 + 自定义小时/分钟按钮”。
- 第一段提醒时间常用按钮调整为 30 分钟、1 小时、2 小时、6 小时、12 小时、18 小时、23 小时；自定义时间通过按钮选择小时 `0-23` 和分钟 `00/05/10...55`，有效范围 `00:05` 到 `23:55`。
- 第二段最终动作时间同样使用按钮选择，且会过滤掉不晚于第一段提醒时间的分钟选项；第一段若太晚导致没有可选最终时间，会隐藏不可用选项。
- Service 层继续保持 5 分钟粒度校验，API / Telegram / Cron 共用同一策略规则；Telegram 只负责收集按钮选择和渲染。
- `formatPolicyMinutes(...)` 优化为展示 `12 小时5 分钟后` 这类人类可读格式，不再把 725 分钟直接展示给用户。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase13-admin-presence.test.ts`（1 个测试文件，6 个测试通过）。

## 2026-05-26 账号 / 分组归属规则定版

- 确认产品规则：分组可以先创建作为管理容器；普通添加账号默认进入「未分组」；从指定分组详情点击「添加账号到本组」时，新 key 直接归入该分组。
- Telegram 账号管理页增加「📁 分组管理」入口，让分组作为账号管理的一部分出现；独立分组入口仍保留兼容已有导航。
- 普通账号添加流程简化为「输入昵称 → 输入 Token」，不再每次强制选择分组；指定分组添加流程仍通过 `accounts:add:to_group:<group_id>` 传入 `group_id`，最终由 `AccountService.createAccount(...)` 保存。
- 账号详情的删除按钮文案改为「从 Bot 删除账号」，确认按钮改为「确认从 Bot 删除账号」，避免误解为删除 Linode 账号或服务器。
- 分组详情的删除按钮文案改为「删除分组」，确认页继续强调只能删除空分组，且不会删除账号或服务器。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase5-accounts.test.ts tests/phase18-telegram-first-experience.test.ts tests/phase19-groups.test.ts`（3 个测试文件，18 个测试通过）。

## 2026-05-26 Telegram 交互顺序修正

- 修复从指定分组添加账号后的上下文丢失：从 A 分组点击「添加账号到本组」并添加成功后，成功页按钮改为「继续添加到本组」和「返回分组详情」，继续添加不会再掉回默认分组。
- 批量操作菜单收敛：不再把单账号/分组/全部账号的开机、关机、删除全部平铺；改为先选范围（单账号 / 分组 / 全部账号），再选开机/关机。批量删除独立放到「⚠️ 批量删除」高危入口。
- 批量操作主菜单补「返回服务器管理」，减少只有返回主菜单导致的层级断裂。
- 补测试覆盖：分组添加账号成功后的继续添加按钮保留分组上下文；批量操作新菜单入口、范围动作页和删除高危入口。
- 局部验证通过：`npm run typecheck`；`npm test -- tests/phase5-accounts.test.ts tests/phase11-batch-operations.test.ts tests/phase18-telegram-first-experience.test.ts tests/phase19-groups.test.ts`（4 个测试文件，25 个测试通过）。

## 2026-05-26 下一轮交接：服务器详情页产品化

- 当前已完成并验证：分组添加账号上下文保留；批量操作菜单收敛；主菜单 / 更多功能 / Reply Keyboard 排版统一。
- 用户指出下一步重点：服务器详情页按钮仍然混乱，需要先对产品方案再开发。
- 已同步产品方向到 `docs/PRODUCT_NEXT.md` / `docs/telegram.md`：服务器详情页应从“按钮集合”改成“状态卡片 + 当前主操作 + 管理更多 + 清晰返回”。
- 建议下一轮 P0：运行中详情只放「关机 / 重启 / 管理更多 / 返回上一列表 / 服务器管理」；已关机只放「开机 / 管理更多 / 返回上一列表 / 服务器管理」；删除移动到「管理更多 → 危险操作 → 删除服务器」；重启增加确认页；返回按钮保留来源上下文。
- 下一轮仍需保持 API-first / Service-first：Telegram 只做展示、收集输入、调用 `InstanceService` / `AppSettingsService` / `ScheduleService`，不要把业务规则堆进 callback。

## 2026-05-26 服务器详情页 P0 产品化

- 服务器详情页按钮从“操作集合”调整为“状态主操作 + 管理更多 + 返回路径”：运行中只露出「关机 / 重启 / 管理更多 / 返回上一列表 / 服务器管理」；已关机只露出「开机 / 管理更多 / 返回上一列表 / 服务器管理」；未知/处理中露出「刷新状态 / 管理更多 / 返回上一列表 / 服务器管理」。
- 单实例删除不再出现在详情页第一层，移动到「管理更多 → ⚠️ 危险操作 → 删除服务器 → 确认删除」。
- 单实例重启改为先进入确认页：`instances:confirm_reboot:<account_id>:<instance_id>[:source]` → `instances:reboot:<account_id>:<instance_id>[:source]`。
- 服务器详情、管理更多、危险操作和操作结果页开始携带来源上下文 source（如 `account_1`、`group_1`、`status_running`、`status_offline`、`all`），「返回上一列表」会尽量回到原列表。
- 补充测试覆盖：详情页不再直接暴露删除/批量入口；重启确认页；管理更多和危险操作二级入口；分组列表详情按钮携带来源上下文。
- 局部验证通过：`npm test -- tests/phase6-instances.test.ts tests/phase7b-instance-boot.test.ts tests/phase7c-instance-shutdown.test.ts tests/phase8-instance-reboot.test.ts tests/phase9-instance-delete.test.ts tests/phase18-telegram-first-experience.test.ts`（6 个测试文件，21 个测试通过）。

## 2026-05-26 账号添加 / Token 更新输入态退出路径

- 账号添加流程改为可退出向导：昵称阶段提供「取消添加 / 返回账号管理」；从分组入口添加时提供「取消添加 / 返回分组详情」。
- Token 输入阶段提供「重新输入昵称 / 取消添加 / 返回账号管理或分组详情」，避免用户只能靠记住 `/cancel` 才能退出。
- 新增回调：`accounts:add:cancel`、`accounts:add:back_alias`、`accounts:add:back_alias:<group_id>`。
- 更新账号 Token 流程增加「取消更新 / 返回账号详情」按钮；Token 更新失败后也继续提供取消按钮，不回显 Token。
- 文档同步：`docs/telegram.md` 和 `docs/PRODUCT_NEXT.md` 已记录账号添加/更新 Token 输入态必须有可视化退出路径。
- 局部验证通过：`npm test -- tests/phase5-accounts.test.ts tests/phase19-groups.test.ts tests/phase3-telegram.test.ts`（3 个测试文件，23 个测试通过）。

## 2026-05-26 账号详情增加服务器入口

- 账号详情页第一层增加「查看该账号服务器」按钮，直接跳转到 `instances:list:account:<account_id>`。
- 该改动复用已有 `InstanceService.listAccountInstances(...)` 和 Telegram 实例列表渲染，不新增业务逻辑。
- 文档同步：`docs/telegram.md` 记录账号详情页服务器入口。

## 2026-05-27 P0 通知闭环：定时任务与保活最终动作

- 新增 `NotificationService`，统一发送后台操作结果通知；当前覆盖定时任务执行结果和保活最终动作结果。
- `schedule_power` Cron 执行定时任务后，会主动通知 Super Admin，展示本轮检查任务数、实际执行任务数、失败任务数，以及任务级总数、成功、失败、跳过保护和失败详情。
- `checkin_monitor` 执行保活最终关机 / 自动删除后，会主动通知 Super Admin，展示策略、动作、范围、距离上次打卡时间、总数、成功、失败、跳过保护和失败详情；自动删除文案使用更高危的 `🚨` 提醒。
- 通知发送失败会被安全吞掉，不影响已经执行的 Linode 操作，也不会导致 Cron 重复执行。
- `admin_presence_policy_runs.summary` 增加 `notification_sent`，便于后续排查通知是否发出。
- 文档同步：`docs/telegram.md` 和 `docs/PRODUCT_NEXT.md` 已记录后台自动动作的主动通知要求与失败隔离原则。
- 局部验证通过：`npm run typecheck`；`npx vitest run tests/phase15-job-runner.test.ts`（1 个测试文件，4 个测试通过）。

## 2026-05-27 P1 批量结果与审计入口优化

- 批量操作结果页增强：按动作显示更明确标题，批量关机使用警告语义，批量删除使用高危语义。
- 批量结果固定展示执行结果：总数、成功、失败、跳过保护；失败详情中的 error_code 转为面向用户的中文原因，例如 Token 权限不足、服务器不存在、Linode API 请求失败。
- 批量删除结果额外提示删除通常不可恢复，并引导查看审计日志确认最终结果。
- 批量结果页统一增加「查看审计日志」入口。
- 单台开机 / 关机 / 重启结果页增加「查看审计日志」入口；单台删除结果页增加不可恢复提示和审计日志入口。
- 文档同步：`docs/telegram.md` 记录批量结果、人话失败原因和高危审计入口要求。


## 2026-05-27 Telegram 按钮美化 P0

- 统一 Telegram 全局按钮 emoji 与语义：查看类、操作类、返回类、审计类和高危类按钮采用一致表达。
- 主菜单 / 更多功能 / 账号 / 服务器 / 批量 / 审计相关 Inline Keyboard 文案完成统一，例如「🔄 刷新主菜单」「🏠 返回主菜单」「📄 查看审计日志」。
- 单台服务器操作按钮按风险表达：开机 `✅`、关机 `⚠️`、重启 `🔄`、删除 `🚨`；删除与批量删除均强化为高危语义。
- 返回路径统一为 `↩️ 返回...`、`🏠 返回主菜单`，取消操作统一为 `❌ 取消`，减少用户在多层菜单中迷路。
- 本轮只调整 Telegram 展示层文案、按钮和测试断言，不改 callback_data，不改业务逻辑，不部署，不推送。
- 验证通过：`npm run typecheck`；`npm test`（24 个测试文件，116 个测试通过）；`npm run build:upload`（Wrangler dry-run 成功）。


## 2026-05-27 定时任务 / 保活策略页面产品化 P1

- 定时任务首页改为卡片式展示：支持范围摘要、Cron 执行后通知说明、任务入口按钮统一 emoji。
- 新增定时任务流程改为 3 步：选择动作、选择范围、选择执行时间；按钮语义统一为 `✅ 定时开机`、`⚠️ 定时关机`、`🔄 定时重启`。
- 定时任务列表增加摘要：总任务数、启用数；任务条目卡片化展示状态、动作、范围、Cron 和下次运行。
- 保活策略首页改为卡片式展示：总策略数、启用数、高危删机策略数；策略条目展示状态、范围、提醒时间、最终动作时间和最终动作。
- 保活策略详情和操作按钮统一语义：`🔔 只通知`、`⚠️ 关闭全部服务器`、`🚨 删除全部服务器`、`⏸ 停用`、`✅ 启用`、`🗑 删除`。
- 本轮只调整 Telegram renderer 文案/按钮、测试和文档，不改业务逻辑，不部署，不推送。
- 验证通过：`npm run typecheck`；`npm test`（24 个测试文件，116 个测试通过）；`npm run build:upload`（Wrangler dry-run 成功，Total Upload 521.73 KiB / gzip 88.59 KiB）。


## 2026-05-27 服务器主链路按钮减法

- 参考老版 `linode-guard-bot` 的按钮风格，服务器入口改为“列表优先”：聊天框下方点击「🖥 服务器」直接展示全部服务器列表，而不是先进入筛选入口页。
- `menu:instances` 服务器管理说明页瘦身为「查看全部服务器 / 筛选 / 批量操作 / 返回主菜单」，按账号、按分组、运行中、已关机统一收进「🔎 筛选」。
- 服务器列表底部从“查看全部/按分组”等重复入口改为「🔄 刷新 / 🔎 筛选 / 返回」，减少按钮墙。
- 单台服务器详情去掉抽象的「🛠 管理更多」层，不再从单台上下文跳到全局保护设置或定时任务中心；详情页只保留当前状态主操作、`🚨 危险操作` 和 `⬅️ 返回列表`。
- 危险操作页只保留「🚨 删除服务器」和「❌ 取消，返回详情」，删除仍不与开机/关机/重启平级。
- 本轮只调整 Telegram 展示层和测试，不改 service 业务逻辑，不部署，不推送。
- 验证通过：`npm run typecheck`；`npm test`（24 个测试文件，116 个测试通过）；`npm run build:upload`（Wrangler dry-run 成功，Total Upload 521.15 KiB / gzip 88.64 KiB）。


## 2026-05-27 定时任务创建流程产品化

- 从产品经理视角重构定时任务创建流程的 Telegram 文案和返回层级，参考老版 `linode-guard-bot` 的“一页只问一个问题”和明确上一步按钮。
- 新增定时任务流程明确为：第 1/3 步选择动作 → 第 2/3 步选择作用对象 → 第 3/3 步选择执行时间。
- 作用对象页明确提示可点击「📁 选择分组」；分组选择页每个分组一行，并提供「⬅️ 上一步：选择范围」。
- 账号、分组、单台服务器、执行时间、自定义时间页都改为明确的「⬅️ 上一步：...」和「❌ 取消」，减少迷路感。
- 自定义时间 / Cron 输入页新增 Inline Keyboard，可返回上一层「选择执行时间」，不再只能依赖 `/cancel`。
- 本轮只调整 Telegram 展示层、callback 适配和测试，不改 ScheduleService 核心业务逻辑，不部署，不推送。


## 2026-05-27 定时任务按钮式选时分

- 用户指出“自定义时间特别坑”，手输 `09:30` / Cron 在 Telegram 手机端容易出错。
- 参考老版 `linode-guard-bot` 的 `hour_keyboard(kind)` / `minute_keyboard(kind, hour)`，新增按钮式选时分：执行时间页点击「🕘 选择其他时间」后先选小时 `00-23`，再选分钟 `00/05/10/.../55`。
- 分钟页支持「⬅️ 上一步：重选小时」，小时页支持「⬅️ 上一步：选择执行时间」。
- 保留「⌨️ 手输 Cron（高级）」作为高级入口，但普通用户主路径不再需要手输时间。
- 新增 compact callback：`sc:th`（选小时）、`sc:tm`（选分钟）、`sc:t`（确认时分创建任务），保持 Telegram callback_data <= 64 bytes。
- 本轮仍只调整 Telegram 展示层和 callback 适配；ScheduleService 核心创建逻辑不变，不部署，不推送。


## 2026-05-27 定时任务修改能力补齐

- 用户指出定时任务和保活策略不能修改是严重产品缺口；确认定时任务此前只有新增、启停、删除，没有真正修改能力。
- 新增 `SchedulesRepository.update(...)` 和 `ScheduleService.updateSchedule(...)`，支持修改名称、启用状态、动作、范围、账号、分组、单台实例、Cron/timezone，并在启用状态下重新计算 `next_run_at`。
- 新增 API：`PATCH /api/v1/schedules/:schedule_id`，写入 `schedule.update` 审计日志。
- Telegram 定时任务列表增加「📋 #id 详情/修改」，详情页增加「✏️ 修改任务」，编辑页支持修改动作、作用范围和执行时间。
- 修改时间支持常用 08:50 / 23:05，以及按钮式小时/分钟选择；不再需要删除重建。
- 保活策略原本已有编辑能力，本轮强化入口文案：列表/详情使用「详情/修改」「修改策略」，避免用户以为不能改。
- 本轮继续保持 Service-first：Telegram 只作为适配层调用 `ScheduleService.updateSchedule(...)` / `AdminPresenceService.updatePolicy(...)`。


## 2026-05-31 Windows 11 Telegram 创建实现

- 新增 Windows 版本模型与 `/api/v1/windows/versions`，支持 `2k22` 与 `w11-ltsc-2024`，语言支持 `zh-cn` / `en-us`。
- 新增 Windows ISO Resolver，Win11 LTSC 2024 自动解析官方 ISO，D1 settings 缓存 6 小时，限制 HTTPS 与 Microsoft 官方下载域名。
- `WindowsInstanceService` 支持 version/lang，Win11 自动传 `WINDOWS_IMAGE_NAME` / `WINDOWS_LANG` / `W11_ISO_URL`，并校验 StackScript data 长度。
- Telegram Windows 创建流程改为选择版本；Win11 继续选择语言，再走 Region → Plan → Firewall → Confirm。
- StackScript 模板补充 Win11 UDF、语言映射、autounattend 修正和 W11 ISO 下载启用。
- 致谢参考：kitknox/winode、bin456789/reinstall、leitbogioro/Tools。


## 2026-05-31 Windows 创建密码策略补强

- Windows 创建支持 API `administrator_password` 可选输入；不传时继续自动生成强密码。
- Telegram 创建流程增加“自动生成强密码 / 自己输入密码”选择；自己输入时会校验复杂度并尝试删除用户密码消息。
- 为避免 Windows autounattend 登录失败风险，Telegram 暂不开放自定义用户名，默认 `Administrator`；Service/API 预留 `windows_username` 并做格式校验。
- StackScript 去掉容易误导的 `example=Password`；用户名自定义暂不进入 StackScript，避免重复创建内置 Administrator。


## 2026-05-31 Windows 创建实例名称自定义

- Telegram Windows 创建流程增加 Linode 实例名称设置步骤：可自定义 label 或跳过自动命名。
- 自定义 label 走 Linode API 原生实例名称限制：3-64 位，只允许英文、数字、点、下划线、短横线，不支持中文。
- 本轮未新增 D1 本地备注表，避免迁移和展示复杂度；用户当前选择的是 Linode 实例名称路线。


## 2026-05-31 Windows 11 RDP 与启动项自动化补强

- 根据实机反馈：Win11 安装后 LISH 能看到桌面，但 RDP 连接不到登录页；安装过程中可能需要在 LISH 手动选择 Windows 11 / Windows 11 step。
- StackScript Win11 unattend 补强 RDP：关闭 NLA（`UserAuthentication=0`）、`SecurityLayer=1`、FirstLogonCommands 强制开启 RDP、放行 Remote Desktop 防火墙组和 TCP 3389、设置 TermService 自动启动。
- Stage 3 最后切换 Windows config 后，不再无条件执行 `reboot -f`；Linode API reboot 成功后等待重启完成，仅在 API reboot 重试失败时 fallback 强制 reboot，避免打乱最终启动项。
- Telegram Windows 创建成功页调整按钮顺序：优先返回主菜单，详情按钮改为“稍后查看服务器详情”，减少创建后立即拉实时详情造成的卡顿感。


## 2026-05-31 Windows 11 unattend 安装失败修复

- 根据 LISH 报错“计算机意外地重新启动或遇到错误，Windows 安装无法继续”，回滚自定义用户名进入 unattend 的实现：不再在 autounattend 创建 `LocalAccount Administrator`，避免重复创建内置 Administrator 触发 setup 失败。
- `WindowsInstanceService` 不再向 StackScript data 传 `WINDOWS_USERNAME`；Telegram/API 仍默认显示/返回 `Administrator`，自定义用户名继续保持未开放。
- RDP 补强命令从 `&&` 链改成 `& ... & exit /b 0`，避免某个防火墙组名在不同语言环境失败时中断 Windows setup。

- 进一步收口 Win11 setup 失败面：Win11 unattend 根节点补 `wcm/xsi` namespace；RDP 补强从 `specialize RunSynchronous` 挪到 `oobeSystem FirstLogonCommands`，specialize 阶段只保留更基础配置，避免 RDP 命令失败导致 Windows 安装主流程中断。

## 2026-06-01 Windows Server 2025 简体中文版与 Win11 创建加固

- 新增 Windows 版本 `2k25-cn`：Windows Server 2025 简体中文版，Telegram 版本选择页可直接选择，默认语言 `zh-cn`。
- `WindowsInstanceService` 创建前新增 service 层硬校验：Region 必须是 core，Plan 必须满足当前 Windows 版本最低内存/磁盘要求，避免绕过 create-options 创建不合规实例。
- StackScript 模板启用 `2k25-cn` 分支，使用官方 Windows Server 2025 zh-CN Evaluation ISO，并复用 2k22 VirtIO 注入路线；增加 Linode API helper 和安装介质/autounattend 复制校验，失败时明确中断。
- 更新 Phase 6 Windows 测试覆盖版本 API、Telegram 版本按钮、Server 2025 payload、StackScript 关键内容和创建前校验。

## 2026-06-01 Windows Server 2025 English 补充

- 新增 Windows 版本 `2k25-en`：Windows Server 2025 English，Telegram 版本选择页可直接选择，默认语言 `en-us`。
- StackScript 模板新增 `2k25-en` UDF 分支，使用 Microsoft 官方 Evaluation en-US ISO，并复用 Server 2025/2022 VirtIO 注入与 RDP 兜底逻辑。
- 更新 Phase 6 Windows 测试覆盖 Server 2025 English 的版本 API、Telegram 按钮、创建 payload 和 StackScript 关键内容。

## 2026-06-01 Windows 安装完成主动通知

- 新增 `windows_installs` 表和 `migrations/0006_windows_installs.sql`，记录 Windows 安装状态、实例、一次性 callback token hash、Telegram chat/user 和通知时间。
- 创建 Windows 实例时生成一次性安装完成 callback token，只保存 hash；StackScript data 增加 `INSTALL_CALLBACK_URL` / `INSTALL_CALLBACK_TOKEN`。`PUBLIC_BASE_URL` 配置后会生成 `/api/v1/windows/install-callback` 完整地址。
- StackScript 在 Windows 首次登录命令里启用 RDP 后调用回调接口；回调成功后 Bot 主动发送“Windows 安装完成，可以尝试远程桌面登录”，不重复发送密码。
- 新增 `tests/phase22-windows-install-callback.test.ts`，完整验证回调 token、状态更新、Telegram 通知和 token 不泄露。验证通过：`npm run typecheck`、`npm test`（25 files / 132 tests）、`npm run build:upload`。
