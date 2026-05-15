# Session Notes

## 当前状态

项目已部署验证过基础 Cloudflare Worker / D1 / Cron / 一键安装流程。后续重点从“能部署”转为“Telegram Bot 真正好用”。

## 最近关键修复

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
