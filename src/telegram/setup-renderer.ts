import type { DeploymentDiagnostics, JobsDiagnostics } from "../services/setup-service";

const DEPLOYMENT_LABELS: Record<string, string> = {
  telegram_bot_token: "Telegram Bot Token",
  telegram_webhook_secret: "Webhook Secret",
  super_admin_telegram_id: "Super Admin Telegram ID",
  api_auth_token: "API Auth Token",
  linode_token_encryption_key: "Token 加密密钥",
  db: "D1 Binding DB",
  tables: "数据表结构"
};

export function renderSetupWizardText(deployment: DeploymentDiagnostics, jobs: JobsDiagnostics): string {
  const lines = [
    "🛠 Linode Guard Lite Setup Wizard",
    "",
    "检查结果："
  ];

  for (const [key, label] of Object.entries(DEPLOYMENT_LABELS)) {
    const check = deployment.checks[key];
    lines.push(`${check?.ok ? "✅" : "❌"} ${label}`);
    if (key === "tables" && check?.missing?.length) {
      lines.push(`   缺失表：${check.missing.join(", ")}`);
    }
  }

  lines.push(`${jobs.status === "ok" ? "✅" : "❌"} 默认 Jobs`);
  if (jobs.missing.length > 0) lines.push(`   缺失 Jobs：${jobs.missing.join(", ")}`);
  if (jobs.disabled.length > 0) lines.push(`   停用 Jobs：${jobs.disabled.join(", ")}`);

  lines.push("", `系统状态：${deployment.status === "ok" && jobs.status === "ok" ? "可用" : "需要处理"}`);

  const problems = Object.entries(deployment.checks)
    .filter(([, check]) => !check.ok && check.message)
    .map(([, check]) => check.message);
  if (problems.length > 0) {
    lines.push("", "问题：", ...problems.map((problem) => `- ${problem}`));
  }

  lines.push("", "下一步：", "1. 如有缺失项，先修复 Cloudflare Worker Secrets / D1 binding / migrations", "2. 调用 POST /api/v1/setup/initialize 初始化默认 settings、jobs 和运行时密钥", "3. 打开 Telegram 后首次消息会自动绑定 Super Admin", "4. Phase 5 再添加 Linode 账号 Token");

  return lines.join("\n");
}
