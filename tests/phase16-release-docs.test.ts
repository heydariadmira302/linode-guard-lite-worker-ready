import { describe, expect, it } from "vitest";

describe("Phase 16 release docs", () => {
  it("contains上线所需 README/deployment/security/troubleshooting/API/Telegram docs and explicit risk notes", async () => {
    const fs = await import("node:fs/promises");
    const readme = await fs.readFile("README.md", "utf8");
    const deployment = await fs.readFile("docs/deployment/cloudflare.md", "utf8");
    const security = await fs.readFile("docs/security.md", "utf8");
    const troubleshooting = await fs.readFile("docs/troubleshooting.md", "utf8");
    const api = await fs.readFile("docs/api.md", "utf8");
    const telegram = await fs.readFile("docs/telegram.md", "utf8");
    const wranglerExample = await fs.readFile("wrangler.toml.example", "utf8");

    expect(readme).toContain("Linode Guard Lite");
    expect(readme).toContain("API-first");
    expect(readme).toContain("Cloudflare Workers");
    expect(readme).toContain("上线前检查");
    expect(readme).toContain("npm run typecheck");
    expect(readme).toContain("npm test");

    expect(deployment).toContain("小白版 Cloudflare 部署教程");
    expect(deployment).toContain("先 fork GitHub 项目");
    expect(deployment).toContain("登录 Cloudflare");
    expect(deployment).toContain("先创建 D1 数据库");
    expect(deployment).toContain("绑定 D1 后，用网页激活初始化数据库");
    expect(deployment).toContain("https://<你的Worker地址>/setup");
    expect(deployment).toContain("初始化数据库表结构");
    expect(deployment).toContain("POST /api/v1/setup/schema");
    expect(deployment).toContain("所以你不用关心有哪些表，也不用手动填写任何表");
    expect(deployment).toContain("关于 KV：当前版本不用创建");
    expect(deployment).toContain("计算 / Compute → Workers & Pages");
    expect(deployment).toContain("Create application");
    expect(deployment).toContain("Import a repository");
    expect(deployment).toContain("Cloudflare Workers and Pages");
    expect(deployment).toContain("Only select repositories");
    expect(deployment).toContain("设置 D1 Binding");
    expect(deployment).toContain("Variable name");
    expect(deployment).toContain("DB");
    expect(deployment).toContain("设置普通变量 Variables");
    expect(deployment).toContain("设置 Secrets 密钥");
    expect(deployment).toContain("设置 Cron Trigger");
    expect(deployment).toContain("* * * * *");
    expect(deployment).toContain("TELEGRAM_BOT_TOKEN");
    expect(deployment).toContain("LINODE_TOKEN_ENCRYPTION_KEY");
    expect(deployment).toContain("自动生成并保存独立的 `API_AUTH_TOKEN`、`TELEGRAM_WEBHOOK_SECRET` 和 `LINODE_TOKEN_ENCRYPTION_KEY`");
    expect(deployment).toContain("setWebhook");
    expect(deployment).toContain("/api/v1/diagnostics/deployment");
    expect(deployment).toContain("/api/v1/diagnostics/jobs");
    expect(deployment).toContain("不要把任何真实密钥提交到 GitHub");
    expect(deployment).toContain("不要首次就测试");
    expect(deployment).toContain("delete_all_instances");

    expect(security).toContain("Linode Token 加密");
    expect(security).toContain("API Bearer Token");
    expect(security).toContain("Webhook Secret");
    expect(security).toContain("审计日志");
    expect(security).toContain("删除风险");

    expect(troubleshooting).toContain("Missing D1 binding DB");
    expect(troubleshooting).toContain("数据表缺失");
    expect(troubleshooting).toContain("Telegram Webhook 不生效");
    expect(troubleshooting).toContain("Cron 没执行");
    expect(troubleshooting).toContain("Linode API 权限不足");

    expect(api).toContain("GET /api/v1/schedules");
    expect(api).toContain("POST /api/v1/schedules");
    expect(api).toContain("Job Runner");
    expect(telegram).toContain("定时开关机");
    expect(telegram).toContain("schedules:list");
    expect(wranglerExample).toContain("[triggers]");
    expect(wranglerExample).toContain("* * * * *");
  });
});
