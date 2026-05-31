import { ErrorCode } from "./error-codes";

const MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHORIZED]: "未授权访问，请检查 API Token 或 Telegram Webhook Secret。",
  [ErrorCode.FORBIDDEN]: "你不是此 Bot 的 Super Admin，无法使用。",
  [ErrorCode.ACCOUNT_NOT_FOUND]: "找不到这个 Linode 账号，可能已经被删除。",
  [ErrorCode.INSTANCE_NOT_FOUND]: "找不到这台服务器，可能已经被删除或账号 Token 无权访问。",
  [ErrorCode.DELETE_DISABLED]: "⛔️ 删除开关未开启，不能删除实例。",
  [ErrorCode.PROTECTED_INSTANCE]: "⛔️ 该实例受到保护，不能删除。",
  [ErrorCode.CONFIRMATION_REQUIRED]: "该操作需要确认后才能继续。",
  [ErrorCode.CONFIRMATION_EXPIRED]: "确认已过期，请重新发起操作。",
  [ErrorCode.LINODE_API_ERROR]: "Linode API 调用失败，请稍后重试；如果持续失败，请检查账号 Token 权限。",
  [ErrorCode.RATE_LIMITED]: "Linode API 或系统请求过于频繁，已被限流，请稍后再试。",
  [ErrorCode.CONFIG_MISSING]: "系统配置缺失，请检查 Cloudflare Worker 变量、Secrets、D1 绑定和初始化状态。",
  [ErrorCode.TOKEN_INVALID]: "Linode Token 无效或已被撤销，请重新生成并更新账号 Token。",
  [ErrorCode.TOKEN_PERMISSION_ERROR]: "Linode Token 权限不足，请确认 Token 具有读取账号、读取实例、管理实例和读取登录事件的权限。",
  [ErrorCode.TELEGRAM_API_ERROR]: "Telegram API 调用失败，请稍后重试。",
  [ErrorCode.D1_ERROR]: "数据库操作失败，请检查 D1 绑定、表结构和迁移是否完整。",
  [ErrorCode.WEBHOOK_SECRET_INVALID]: "Telegram Webhook Secret 校验失败。",
  [ErrorCode.SCHEDULE_NOT_FOUND]: "找不到这个定时任务。",
  [ErrorCode.POLICY_NOT_FOUND]: "找不到这个保活策略组。",
  [ErrorCode.JOB_FAILED]: "后台任务执行失败。",
  [ErrorCode.VALIDATION_ERROR]: "输入格式不正确，请检查后重试。"
};

export function mapTelegramErrorMessage(code: ErrorCode): string {
  return MESSAGES[code];
}
