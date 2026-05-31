export type TelegramResultStatus = "success" | "submitted" | "failed" | "partial_failed" | "skipped" | "warning";

export type TelegramResultField = {
  label: string;
  value?: string | number | boolean | null;
};

export type TelegramResultInput = {
  title: string;
  status: TelegramResultStatus;
  requestId?: string;
  fields?: TelegramResultField[];
  message?: string;
  nextStep?: string;
  errorMessage?: string | null;
  errorCode?: string | null;
};

export function renderTelegramOperationResult(input: TelegramResultInput): string {
  const lines = [
    `${statusIcon(input.status)} ${input.title}`,
    "",
    `结果：${statusLabel(input.status)}`,
    input.requestId ? `请求编号：${input.requestId}` : "",
    ...renderFields(input.fields ?? []),
    input.errorMessage ? `失败原因：${input.errorMessage}` : "",
    input.errorCode ? `错误码：${input.errorCode}` : "",
    input.message ? ["", input.message].join("\n") : "",
    input.nextStep ? ["", `下一步：${input.nextStep}`].join("\n") : ""
  ];
  return lines.filter((line) => line !== "").join("\n");
}

function renderFields(fields: TelegramResultField[]): string[] {
  return fields
    .filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim() !== "")
    .map((field) => `${field.label}：${field.value}`);
}

function statusIcon(status: TelegramResultStatus): string {
  if (status === "success") return "✅";
  if (status === "submitted") return "✅";
  if (status === "partial_failed") return "⚠️";
  if (status === "failed") return "❌";
  if (status === "skipped") return "⏭️";
  return "⚠️";
}

function statusLabel(status: TelegramResultStatus): string {
  if (status === "success") return "成功";
  if (status === "submitted") return "已成功提交";
  if (status === "partial_failed") return "部分失败";
  if (status === "failed") return "失败";
  if (status === "skipped") return "已跳过";
  return "需要注意";
}
