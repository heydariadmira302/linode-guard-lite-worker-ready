export function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    "account.create": "添加账号",
    "account.delete": "删除账号",
    "account.test": "测试账号 Token",
    "account.update_token": "更新账号 Token",
    "group.create": "新建分组",
    "group.rename": "重命名分组",
    "group.delete": "删除分组",
    "group.move_account": "移动账号分组",
    "instance.boot": "开机服务器",
    "instance.shutdown": "关机服务器",
    "instance.reboot": "重启服务器",
    "instance.delete": "删除服务器",
    "batch.boot": "批量开机",
    "batch.shutdown": "批量关机",
    "batch.delete": "批量删除",
    "schedule.create": "创建定时任务",
    "schedule.update": "更新定时任务",
    "schedule.enable": "启用定时任务",
    "schedule.disable": "停用定时任务",
    "schedule.enable_all": "启用全部定时任务",
    "schedule.disable_all": "停用全部定时任务",
    "schedule.delete": "删除定时任务",
    "security.check": "安全检查",
    "security.event.confirm": "确认安全事件",
    "security.event.mark_suspicious": "标记可疑安全事件",
    "security.generate_token": "生成 Linode Token",
    "security.settings.update": "更新安全设置",
    "app.settings.update": "更新应用设置",
    "admin_presence.checkin": "管理员保活打卡",
    "admin_presence.policy.create": "创建保活策略",
    "admin_presence.policy.update": "更新保活策略",
    "admin_presence.policy.enable": "启用保活策略",
    "admin_presence.policy.disable": "停用保活策略",
    "admin_presence.policy.delete": "删除保活策略",
    "admin_presence.policy.notify": "保活提醒通知",
    "admin_presence.policy.shutdown_all_instances": "保活触发批量关机",
    "admin_presence.policy.delete_all_instances": "保活触发批量删除"
  };
  return labels[action] ?? action;
}

export function formatAuditTargetType(targetType: string): string {
  const labels: Record<string, string> = {
    account: "账号",
    group: "分组",
    instance: "服务器",
    security: "安全检查",
    security_event: "安全事件",
    app_settings: "应用设置",
    power_schedule: "定时任务",
    admin_presence: "管理员保活",
    admin_presence_policy: "保活策略"
  };
  return labels[targetType] ?? targetType;
}

export function formatAuditRiskLevel(riskLevel: string): string {
  if (riskLevel === "critical") return "严重";
  if (riskLevel === "high") return "高";
  if (riskLevel === "medium") return "中";
  if (riskLevel === "low") return "低";
  return riskLevel;
}

export function formatAuditResult(result: string): string {
  if (result === "success") return "成功";
  if (result === "partial_failed") return "部分失败";
  if (result === "failed") return "失败";
  if (result === "skipped") return "已跳过";
  return result;
}

export function formatAuditError(code?: string | null): string {
  if (!code) return "无";
  const labels: Record<string, string> = {
    UNAUTHORIZED: "未授权，请检查 API Token",
    FORBIDDEN: "无权限执行该操作",
    ACCOUNT_NOT_FOUND: "账号不存在或已删除",
    INSTANCE_NOT_FOUND: "服务器不存在或不属于该账号",
    TOKEN_INVALID: "Linode Token 无效",
    TOKEN_PERMISSION_ERROR: "Linode Token 权限不足",
    LINODE_API_ERROR: "Linode API 调用失败",
    LINODE_RATE_LIMITED: "Linode API 限流",
    RATE_LIMITED: "请求过于频繁",
    CONFIG_MISSING: "系统配置缺失",
    D1_ERROR: "数据库操作失败",
    TELEGRAM_API_ERROR: "Telegram API 调用失败",
    WEBHOOK_SECRET_INVALID: "Telegram Webhook Secret 校验失败",
    SCHEDULE_NOT_FOUND: "定时任务不存在或已删除",
    POLICY_NOT_FOUND: "保活策略不存在或已删除",
    DELETE_DISABLED: "删除开关未开启",
    PROTECTED_INSTANCE: "服务器受保护，操作已被拦截",
    CONFIRMATION_REQUIRED: "该操作需要确认后才能继续",
    CONFIRMATION_EXPIRED: "确认已过期，请重新发起操作",
    VALIDATION_ERROR: "参数错误或被安全规则拦截",
    JOB_FAILED: "后台任务执行失败"
  };
  return labels[code] ?? code;
}

export function formatAuditActor(actor: string): string {
  if (actor.startsWith("telegram:")) return `Telegram 用户 ${actor.slice("telegram:".length)}`;
  if (actor.startsWith("api:")) return "API 调用";
  if (actor.startsWith("cron:")) return "后台定时任务";
  return actor;
}

export function formatAuditSource(source: string): string {
  if (source === "telegram") return "Telegram";
  if (source === "api") return "HTTP API";
  if (source === "cron") return "定时任务";
  return source;
}

export function formatAuditTime(value: string, timezone = "Asia/Shanghai"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    return value;
  }
}
