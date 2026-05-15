# Linode Guard Lite 源码包说明

本包内容：

- 完整 TypeScript 源码：`src/`
- 测试用例：`tests/`
- D1 数据库 schema：`schema.sql`、`migrations/0001_initial.sql`
- Cloudflare Workers 配置示例：`wrangler.toml`、`wrangler.toml.example`
- 完整技术文档：`docs/`
- 项目 README：`README.md`
- 新会话交接提示词：见 `docs/prd-and-architecture.md` 第 28 节「新会话交接提示词」

已验证：

```bash
npm run typecheck
npm test
```

验证结果：

- TypeScript typecheck 通过
- Vitest：20 个测试文件通过，72 个测试通过

注意：

- 压缩包不包含 `node_modules/`
- 压缩包不包含 `.git/`
- 不应把真实 Telegram Bot Token、Linode Token、Cloudflare Token、API Token 提交或写入仓库
