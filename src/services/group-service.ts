import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AuditRepository } from "../storage/audit-repository";
import { GroupsRepository, type GroupRecord, type GroupWithCountsRecord } from "../storage/groups-repository";
import { AuditService } from "./audit-service";

export type GroupContext = { requestId: string; actor: string; source: string };

export type PublicGroup = {
  id: number;
  name: string;
  is_default: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  account_count: number;
};

export class GroupService {
  private readonly groups: GroupsRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, groups?: GroupsRepository, audit?: AuditService) {
    if (!env.DB && !groups) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.groups = groups ?? new GroupsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async listGroups(): Promise<{ groups: PublicGroup[] }> {
    return { groups: (await this.groups.list()).map(toPublicGroup) };
  }

  async getGroup(id: number): Promise<{ group: PublicGroup }> {
    validateId(id, "req_group");
    const groups = await this.groups.list();
    const group = groups.find((item) => item.id === id);
    if (!group) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", "req_group", 404);
    return { group: toPublicGroup(group) };
  }

  async createGroup(name: string, context: GroupContext): Promise<{ group: PublicGroup }> {
    const normalized = validateName(name, context.requestId);
    const existing = await this.groups.getByName(normalized);
    if (existing) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group name already exists", context.requestId, 400);
    const group = toPublicGroup(await this.groups.create(normalized));
    await this.recordAudit(context, "group.create", String(group.id), "medium", "success", null, { name: group.name });
    return { group };
  }

  async renameGroup(id: number, name: string, context: GroupContext): Promise<{ group: PublicGroup }> {
    validateId(id, context.requestId);
    const normalized = validateName(name, context.requestId);
    const group = await this.groups.getById(id);
    if (group.is_default) throw new AppError(ErrorCode.VALIDATION_ERROR, "Default group cannot be renamed", context.requestId, 400);
    const existing = await this.groups.getByName(normalized);
    if (existing && existing.id !== id) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group name already exists", context.requestId, 400);
    const renamed = toPublicGroup(await this.groups.rename(id, normalized));
    await this.recordAudit(context, "group.rename", String(id), "medium", "success", null, { name: renamed.name });
    return { group: renamed };
  }

  async deleteGroup(id: number, context: GroupContext): Promise<{ group: PublicGroup }> {
    validateId(id, context.requestId);
    const group = await this.groups.getById(id);
    if (group.is_default) throw new AppError(ErrorCode.VALIDATION_ERROR, "Default group cannot be deleted", context.requestId, 400);
    const accountCount = await this.groups.countActiveAccounts(id);
    if (accountCount > 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group is not empty", context.requestId, 400);
    const deleted = toPublicGroup(await this.groups.softDelete(id));
    await this.recordAudit(context, "group.delete", String(id), "medium", "success", null, { name: deleted.name });
    return { group: deleted };
  }

  async moveAccountToGroup(accountId: number, groupId: number, context: GroupContext): Promise<{ group: PublicGroup; account_id: number }> {
    validateId(accountId, context.requestId);
    validateId(groupId, context.requestId);
    const group = await this.groups.getById(groupId);
    await this.groups.moveAccount(accountId, groupId);
    const publicGroup = toPublicGroup(group);
    await this.recordAudit(context, "group.account.move", String(groupId), "medium", "success", null, { account_id: accountId, group_id: groupId });
    return { group: publicGroup, account_id: accountId };
  }

  private async recordAudit(context: GroupContext, action: string, targetId: string, riskLevel: string, result: string, errorCode: string | null, metadata: unknown): Promise<void> {
    await this.audit?.record({
      request_id: context.requestId,
      actor: context.actor,
      source: context.source,
      action,
      target_type: "group",
      target_id: targetId,
      risk_level: riskLevel,
      result,
      error_code: errorCode,
      metadata_json: JSON.stringify(metadata)
    });
  }
}

function validateId(id: number, requestId: string): void {
  if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid group id", requestId, 400);
}

function validateName(name: string, requestId: string): string {
  const normalized = name?.trim();
  if (!normalized || !/^[\p{Script=Han}a-zA-Z0-9 _-]{1,32}$/u.test(normalized)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Group name must be 1-32 chars and can include Chinese, letters, numbers, spaces, underscore, or hyphen", requestId, 400);
  }
  return normalized;
}

function toPublicGroup(group: GroupRecord | GroupWithCountsRecord): PublicGroup {
  return {
    id: group.id,
    name: group.name,
    is_default: group.is_default,
    created_at: group.created_at,
    updated_at: group.updated_at,
    deleted_at: group.deleted_at ?? null,
    account_count: "account_count" in group ? Number(group.account_count) : 0
  };
}
