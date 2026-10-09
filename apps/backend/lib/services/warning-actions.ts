import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/types";
import { ApiError } from "@/lib/utils/api-error";
import { EARLY_WARNING_CASE_TYPE, SUPERSEDED_EARLY_WARNING_CASE_TYPE } from "@/lib/services/warning-case-types";

export const WARNING_ACTION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "ESCALATED",
  "REOPENED",
] as const;

export type WarningActionStatus = (typeof WARNING_ACTION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<WarningActionStatus, readonly WarningActionStatus[]> = {
  OPEN: ["IN_PROGRESS", "ESCALATED"],
  IN_PROGRESS: ["RESOLVED", "ESCALATED"],
  ESCALATED: ["IN_PROGRESS"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED", "ESCALATED"],
};

export function parseWarningActionStatus(value: unknown, fallback?: WarningActionStatus): WarningActionStatus {
  if (value == null && fallback) return fallback;
  if (typeof value === "string" && WARNING_ACTION_STATUSES.includes(value as WarningActionStatus)) {
    return value as WarningActionStatus;
  }
  throw new ApiError(
    `status must be one of: ${WARNING_ACTION_STATUSES.join(", ")}`,
    "INVALID_STATUS",
    400,
  );
}

export function assertWarningActionTransition(from: WarningActionStatus, to: WarningActionStatus) {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ApiError(`Cannot transition warning action from ${from} to ${to}`, "INVALID_STATUS_TRANSITION", 409);
  }
}

function parseDueDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError("dueDate must use YYYY-MM-DD format", "INVALID_DUE_DATE", 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError("dueDate is not a valid calendar date", "INVALID_DUE_DATE", 400);
  }
  return parsed;
}

function historyArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value : [];
}

async function assertActiveAssignee(assignedUserId: string | null | undefined) {
  if (!assignedUserId) return;
  const assignee = await prisma.user.findFirst({
    where: { id: assignedUserId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!assignee) throw new ApiError("Assigned user not found or inactive", "INVALID_ASSIGNEE", 400);
}

export class WarningActionsService {
  static async create(data: {
    studentId: string;
    runId?: string | null;
    actionType: string;
    note: string;
    status?: string;
    assignedUserId?: string | null;
    dueDate?: string | null;
  }, actor: Actor) {
    const actionType = data.actionType.trim();
    const note = data.note.trim();
    if (!actionType || !note) throw new ApiError("actionType and note are required", "INVALID_REQUEST", 400);
    const status = parseWarningActionStatus(data.status, "OPEN");
    if (status !== "OPEN") {
      throw new ApiError("A new warning action must start as OPEN and continue through lifecycle updates", "INVALID_STATUS", 400);
    }
    const dueDate = parseDueDate(data.dueDate);
    await assertActiveAssignee(data.assignedUserId);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const action = await tx.warningAction.create({
        data: {
          studentId: data.studentId,
          runId: data.runId || null,
          actionType,
          note,
          actorId: actor.userId,
          actorName: actor.fullName,
          assignedUserId: data.assignedUserId || null,
          dueDate: dueDate ?? null,
          resolvedAt: null,
          status,
          statusHistory: [{
            event: "created",
            from: null,
            to: status,
            changedAt: now.toISOString(),
            actorId: actor.userId,
            actorName: actor.fullName,
          }],
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "warning_action.create",
          resourceType: "WarningAction",
          resourceId: action.id,
          details: {
            studentId: data.studentId,
            runId: data.runId || null,
            status,
            assignedUserId: data.assignedUserId || null,
            dueDate: dueDate?.toISOString().slice(0, 10) || null,
          },
        },
      });
      return action;
    });
  }

  static async update(id: string, data: {
    status?: string;
    assignedUserId?: string | null;
    dueDate?: string | null;
    note?: string;
  }, actor: Actor) {
    if (data.status === undefined && data.assignedUserId === undefined && data.dueDate === undefined && data.note === undefined) {
      throw new ApiError("At least one updatable field is required", "INVALID_REQUEST", 400);
    }
    const current = await prisma.warningAction.findUnique({ where: { id } });
    if (!current) throw new ApiError("Warning action not found", "NOT_FOUND", 404);
    if (current.caseType === EARLY_WARNING_CASE_TYPE || current.caseType === SUPERSEDED_EARLY_WARNING_CASE_TYPE) {
      throw new ApiError(
        "Early-warning intervention cases must use the intervention workflow API",
        "INTERVENTION_CASE_API_REQUIRED",
        409,
      );
    }

    const currentStatus = parseWarningActionStatus(current.status);
    const status = data.status === undefined ? currentStatus : parseWarningActionStatus(data.status);
    assertWarningActionTransition(currentStatus, status);
    const dueDate = parseDueDate(data.dueDate);
    await assertActiveAssignee(data.assignedUserId);
    const note = data.note === undefined ? undefined : data.note.trim();
    if (data.note !== undefined && !note) throw new ApiError("note cannot be empty", "INVALID_REQUEST", 400);

    const now = new Date();
    const changedFields = [
      ...(status !== currentStatus ? ["status"] : []),
      ...(data.assignedUserId !== undefined && data.assignedUserId !== current.assignedUserId ? ["assignedUserId"] : []),
      ...(data.dueDate !== undefined && dueDate?.getTime() !== current.dueDate?.getTime() ? ["dueDate"] : []),
      ...(data.note !== undefined ? ["note"] : []),
    ];
    if (!changedFields.length) return current;
    const statusHistory: Prisma.JsonArray = [...historyArray(current.statusHistory)];
    if (status !== currentStatus) {
      statusHistory.push({
        event: "status_changed",
        from: currentStatus,
        to: status,
        changedAt: now.toISOString(),
        actorId: actor.userId,
        actorName: actor.fullName,
      });
    }
    if (data.note !== undefined) {
      statusHistory.push({
        event: "note_added",
        note,
        changedAt: now.toISOString(),
        actorId: actor.userId,
        actorName: actor.fullName,
      });
    }
    if (data.assignedUserId !== undefined && data.assignedUserId !== current.assignedUserId) {
      statusHistory.push({
        event: "assignee_changed",
        from: current.assignedUserId,
        to: data.assignedUserId,
        changedAt: now.toISOString(),
        actorId: actor.userId,
        actorName: actor.fullName,
      });
    }
    if (data.dueDate !== undefined && dueDate?.getTime() !== current.dueDate?.getTime()) {
      statusHistory.push({
        event: "due_date_changed",
        from: current.dueDate?.toISOString() || null,
        to: dueDate?.toISOString() || null,
        changedAt: now.toISOString(),
        actorId: actor.userId,
        actorName: actor.fullName,
      });
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.warningAction.updateMany({
        where: { id, status: currentStatus },
        data: {
          ...(data.status !== undefined ? { status } : {}),
          ...(data.assignedUserId !== undefined ? { assignedUserId: data.assignedUserId } : {}),
          ...(data.dueDate !== undefined ? { dueDate } : {}),
          statusHistory,
          ...(status === "RESOLVED" && currentStatus !== "RESOLVED" ? { resolvedAt: now } : {}),
          ...(currentStatus === "RESOLVED" && status !== "RESOLVED" ? { resolvedAt: null } : {}),
          updatedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ApiError("Warning action changed concurrently; reload and retry", "CONCURRENT_UPDATE", 409);
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "warning_action.update",
          resourceType: "WarningAction",
          resourceId: id,
          details: { changedFields, fromStatus: currentStatus, toStatus: status },
        },
      });
      return tx.warningAction.findUniqueOrThrow({ where: { id } });
    });
  }
}
