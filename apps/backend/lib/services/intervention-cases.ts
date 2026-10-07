import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Actor } from "@/lib/auth/types";
import { normalizeWarningBusinessStatus } from "./academic-warning-rules";
import { ApiError } from "@/lib/utils/api-error";
import { loadWarningActionHistory } from "./warning-action-history";
import {
  assertWarningActionTransition,
  parseWarningActionStatus,
  type WarningActionStatus,
} from "@/lib/services/warning-actions";

export const EARLY_WARNING_CASE_TYPE = "EARLY_WARNING_CASE" as const;
export const ACTIVE_INTERVENTION_STATUSES = ["OPEN", "IN_PROGRESS", "ESCALATED", "REOPENED"] as const;
export const INTERVENTION_TRIGGER_STATUSES = ["MONITORING", "HIGH_RISK", "VERIFY_REQUIRED"] as const;
export const INTERVENTION_TYPES = [
  "REMINDER",
  "DIRECT_COUNSELING",
  "CONTACT",
  "STUDY_PLAN_GUIDANCE",
  "OTHER",
] as const;
export const WARNING_ACTION_EVENT_TYPES = [
  "CASE_CREATED",
  "WARNING_DETECTED",
  "RISK_STATUS_CHANGED",
  "ASSIGNED",
  "REASSIGNED",
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "INTERVENTION_RECORDED",
  "FOLLOW_UP_SCHEDULED",
  "CASE_RESOLVED",
  "CASE_REOPENED",
] as const;

export type InterventionType = (typeof INTERVENTION_TYPES)[number];
export type WarningBusinessStatus = "NORMAL" | "PARTIAL_NO_RISK" | "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED" | "INSUFFICIENT_DATA";

export type InterventionQueueFilters = {
  status?: string;
  businessStatus?: string;
  classId?: string;
  academicTermId?: string;
  overdue?: boolean;
  search?: string;
  page: number;
  pageSize: number;
};

type SyncResult = {
  runId: string;
  processedResults: number;
  createdCases: number;
  updatedCases: number;
  unchangedResults: number;
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isInterventionTriggerStatus(status: string | null | undefined): status is "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED" {
  return INTERVENTION_TRIGGER_STATUSES.includes(status as "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED");
}

export function createInterventionEpisodeKey(studentId: string, createdRunId: string) {
  return `${studentId}:${EARLY_WARNING_CASE_TYPE}:${createdRunId}`;
}

export function isInterventionCaseOverdue(
  input: { status: string; nextFollowUpAt: Date | null },
  now = new Date(),
) {
  return input.status !== "RESOLVED" && input.nextFollowUpAt !== null && input.nextFollowUpAt.getTime() < now.getTime();
}

function eventKey(caseId: string, runId: string, eventType: string) {
  return `${caseId}:${runId}:${eventType}`;
}

function parseDateTime(value: Date | string, fieldName: string) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(`${fieldName} must be a valid date-time`, "INVALID_DATE_TIME", 400);
  }
  return parsed;
}

function actorHasRole(actor: Actor, role: string) {
  return actor.grants.some((grant) => grant.role === role);
}

function actorHasScope(actor: Actor, scope: string) {
  return actor.grants.some((grant) => grant.scope === scope);
}

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? value : {};
}

function queuePriority(status: string, businessStatus: string | null, overdue: boolean) {
  const risk = businessStatus === "VERIFY_REQUIRED" ? 0 : businessStatus === "HIGH_RISK" ? 1 : 2;
  const intervention = status === "OPEN" ? 0 : status === "REOPENED" ? 1 : status === "IN_PROGRESS" ? 2 : status === "ESCALATED" ? 3 : 4;
  return [risk, overdue ? 0 : 1, intervention] as const;
}

async function scopedQueueRows(
  actor: Actor,
  filters: Omit<InterventionQueueFilters, "page" | "pageSize"> & { caseId?: string } = {},
) {
  const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "REOPENED"];
  const businessStatuses = ["NORMAL", "PARTIAL_NO_RISK", "MONITORING", "HIGH_RISK", "VERIFY_REQUIRED", "INSUFFICIENT_DATA"];
  if (filters.status && !statuses.includes(filters.status)) {
    throw new ApiError(`status must be one of: ${statuses.join(", ")}`, "INVALID_STATUS", 400);
  }
  if (filters.businessStatus && !businessStatuses.includes(filters.businessStatus)) {
    throw new ApiError(`businessStatus must be one of: ${businessStatuses.join(", ")}`, "INVALID_BUSINESS_STATUS", 400);
  }
  const now = new Date();
  const cases = await prisma.warningAction.findMany({
    where: {
      caseType: EARLY_WARNING_CASE_TYPE,
      ...(filters.caseId ? { id: filters.caseId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.businessStatus ? { latestBusinessStatus: normalizeWarningBusinessStatus(filters.businessStatus) === "NORMAL"
        ? { in: ["NORMAL", "PARTIAL_NO_RISK"] } : filters.businessStatus } : {}),
      ...(filters.overdue === true ? { status: { not: "RESOLVED" }, nextFollowUpAt: { lt: now } } : {}),
      ...(filters.overdue === false ? {
        OR: [{ status: "RESOLVED" }, { nextFollowUpAt: null }, { nextFollowUpAt: { gte: now } }],
      } : {}),
    },
  });
  if (!cases.length) return [];

  const resultIds = cases.flatMap((item) => item.latestWarningResultId ? [item.latestWarningResultId] : []);
  const runIds = cases.flatMap((item) => item.latestWarningRunId ? [item.latestWarningRunId] : []);
  const [results, runs] = await Promise.all([
    prisma.academicWarningStudentResult.findMany({
      where: { id: { in: resultIds } },
      select: {
        id: true,
        studentId: true,
        classId: true,
        sStudentId: true,
        sStudentName: true,
        sClassName: true,
        sProgramCode: true,
        businessStatus: true,
      },
    }),
    prisma.academicWarningRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, assessmentAcademicTermId: true, trainingProgramId: true },
    }),
  ]);
  const resultById = new Map(results.map((item) => [item.id, item]));
  const runById = new Map(runs.map((item) => [item.id, item]));
  const classIds = [...new Set(results.flatMap((item) => item.classId ? [item.classId] : []))];
  const classes = classIds.length
    ? await prisma.class.findMany({
        where: { id: { in: classIds }, deletedAt: null },
        select: { id: true, classId: true, className: true },
      })
    : [];
  const classById = new Map(classes.map((item) => [item.id, item]));

  const roles = new Set(actor.grants.map((grant) => grant.role));
  const global = roles.has("admin") || actorHasScope(actor, "system");
  const advisor = roles.has("class_advisor") && actorHasScope(actor, "assigned_classes");
  const facultyManager = roles.has("faculty_manager") && actorHasScope(actor, "faculty");
  const [advisorAssignments, facultyPrograms] = await Promise.all([
    advisor
      ? prisma.classAdvisorAssignment.findMany({
          where: { userId: actor.userId, status: "active", revokedAt: null },
          select: { classId: true },
        })
      : [],
    facultyManager
      ? prisma.lecturerProfile.findUnique({
          where: { userId: actor.userId },
          select: { facultyCode: true },
        }).then((lecturer) => lecturer?.facultyCode
          ? prisma.trainingProgram.findMany({
              where: { s_faculty_code: lecturer.facultyCode, deletedAt: null, isActive: true },
              select: { id: true },
            })
          : [])
      : [],
  ]);
  // Một phân công GVCN/CVHT đang hoạt động xác định trách nhiệm đối với lớp.
  // Học kỳ trên bản ghi phân công là thời điểm quản lý hiện tại, không phải
  // điều kiện để ẩn các hồ sơ cảnh báo đã phát sinh ở học kỳ trước của lớp đó.
  const advisorClassIds = new Set(advisorAssignments.map((item) => item.classId));
  const facultyProgramIds = new Set(facultyPrograms.map((item) => item.id));
  const search = filters.search?.trim().toLocaleLowerCase("vi") || "";

  return cases.flatMap((interventionCase) => {
    const result = interventionCase.latestWarningResultId
      ? resultById.get(interventionCase.latestWarningResultId)
      : undefined;
    const run = interventionCase.latestWarningRunId
      ? runById.get(interventionCase.latestWarningRunId)
      : undefined;
    const studentClass = result?.classId ? classById.get(result.classId) : undefined;
    const inScope = global || Boolean(
      result && run && (
        (advisor && result.classId && advisorClassIds.has(result.classId)) ||
        (facultyManager && facultyProgramIds.has(run.trainingProgramId))
      ),
    );
    if (!inScope) return [];
    if (filters.classId && result?.classId !== filters.classId && studentClass?.classId !== filters.classId) return [];
    if (filters.academicTermId && run?.assessmentAcademicTermId !== filters.academicTermId) return [];
    if (search && !`${result?.sStudentId || ""} ${result?.sStudentName || ""}`.toLocaleLowerCase("vi").includes(search)) return [];
    const overdue = isInterventionCaseOverdue(interventionCase, now);
    return [{
      caseId: interventionCase.id,
      episodeKey: interventionCase.episodeKey,
      student: {
        id: interventionCase.studentId,
        studentCode: result?.sStudentId || null,
        fullName: result?.sStudentName || null,
        classId: result?.classId || null,
        classCode: studentClass?.classId || null,
        className: studentClass?.className || result?.sClassName || null,
        programCode: result?.sProgramCode || null,
      },
      latestBusinessStatus: normalizeWarningBusinessStatus(interventionCase.latestBusinessStatus),
      interventionStatus: interventionCase.status,
      latestWarningRunId: interventionCase.latestWarningRunId,
      latestWarningResultId: interventionCase.latestWarningResultId,
      assessmentAcademicTermId: run?.assessmentAcademicTermId || null,
      lastDetectedAt: interventionCase.lastDetectedAt,
      nextFollowUpAt: interventionCase.nextFollowUpAt,
      overdue,
      resolvedAt: interventionCase.resolvedAt,
      createdAt: interventionCase.createdAt,
      updatedAt: interventionCase.updatedAt,
    }];
  });
}

async function assertCanMutateInterventionCase(caseId: string, actor: Actor) {
  const interventionCase = await prisma.warningAction.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      studentId: true,
      caseType: true,
      latestWarningRunId: true,
      latestWarningResultId: true,
      status: true,
      nextFollowUpAt: true,
      updatedAt: true,
    },
  });
  if (!interventionCase || interventionCase.caseType !== EARLY_WARNING_CASE_TYPE) {
    throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
  }

  if (actorHasRole(actor, "admin") || actorHasScope(actor, "system")) return interventionCase;

  const isAdvisor = actorHasRole(actor, "class_advisor") && actorHasScope(actor, "assigned_classes");
  if (!isAdvisor) {
    throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
  }
  if (!interventionCase.latestWarningRunId || !interventionCase.latestWarningResultId) {
    throw new ApiError("Intervention case has incomplete warning provenance", "FORBIDDEN", 403);
  }

  const [run, result] = await Promise.all([
    prisma.academicWarningRun.findUnique({
      where: { id: interventionCase.latestWarningRunId },
      select: { assessmentAcademicTermId: true },
    }),
    prisma.academicWarningStudentResult.findUnique({
      where: { id: interventionCase.latestWarningResultId },
      select: { classId: true, studentId: true },
    }),
  ]);
  if (!run || !result?.classId || result.studentId !== interventionCase.studentId) {
    throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
  }
  const assignment = await prisma.classAdvisorAssignment.findFirst({
    where: {
      userId: actor.userId,
      classId: result.classId,
      status: "active",
      revokedAt: null,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
  }
  return interventionCase;
}

async function syncPersistedResult(
  run: { id: string; assessmentAcademicTermId: string; completedAt: Date | null },
  result: { id: string; studentId: string; classId: string | null; businessStatus: string },
) {
  const activeWhere = {
    studentId: result.studentId,
    caseType: EARLY_WARNING_CASE_TYPE,
    status: { in: [...ACTIVE_INTERVENTION_STATUSES] },
  } satisfies Prisma.WarningActionWhereInput;
  const detectedAt = run.completedAt ?? new Date();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const activeCase = await tx.warningAction.findFirst({ where: activeWhere });
        const shouldCreate = isInterventionTriggerStatus(result.businessStatus);

        if (!activeCase) {
          if (!shouldCreate) return "unchanged" as const;
          const episodeKey = createInterventionEpisodeKey(result.studentId, run.id);
          const previouslyHandledEpisode = await tx.warningAction.findUnique({ where: { episodeKey } });
          if (previouslyHandledEpisode) return "unchanged" as const;

          const created = await tx.warningAction.create({
            data: {
              studentId: result.studentId,
              runId: run.id,
              actionType: "EARLY_WARNING_INTERVENTION",
              note: "System-created intervention case from a persisted academic warning result.",
              actorId: null,
              actorName: "SYSTEM",
              // Quyền xử lý được suy ra trực tiếp từ GVCN/CVHT đang quản lý
              // lớp ở học kỳ cảnh báo, không phụ thuộc phân công riêng cho ca.
              assignedUserId: null,
              dueDate: null,
              resolvedAt: null,
              status: "OPEN",
              statusHistory: [],
              caseType: EARLY_WARNING_CASE_TYPE,
              episodeKey,
              sourceWarningRunId: run.id,
              sourceWarningResultId: result.id,
              latestWarningRunId: run.id,
              latestWarningResultId: result.id,
              latestBusinessStatus: result.businessStatus,
              lastDetectedAt: detectedAt,
              nextFollowUpAt: null,
            },
          });
          const events: Prisma.WarningActionEventCreateManyInput[] = [
            {
              id: crypto.randomUUID(),
              warningActionId: created.id,
              eventType: "CASE_CREATED",
              systemGenerated: true,
              sourceRunId: run.id,
              idempotencyKey: eventKey(created.id, run.id, "CASE_CREATED"),
              details: { status: "OPEN", episodeKey },
            },
            {
              id: crypto.randomUUID(),
              warningActionId: created.id,
              eventType: "WARNING_DETECTED",
              systemGenerated: true,
              sourceRunId: run.id,
              idempotencyKey: eventKey(created.id, run.id, "WARNING_DETECTED"),
              details: { warningResultId: result.id, businessStatus: result.businessStatus },
            },
          ];
          await tx.warningActionEvent.createMany({ data: events, skipDuplicates: true });
          return "created" as const;
        }

        if (activeCase.latestWarningRunId === run.id) return "unchanged" as const;
        const previousBusinessStatus = activeCase.latestBusinessStatus;
        await tx.warningAction.update({
          where: { id: activeCase.id },
          data: {
            latestWarningRunId: run.id,
            latestWarningResultId: result.id,
            latestBusinessStatus: result.businessStatus,
            ...(shouldCreate ? { lastDetectedAt: detectedAt } : {}),
            updatedAt: detectedAt,
          },
        });
        const events: Prisma.WarningActionEventCreateManyInput[] = [];
        if (shouldCreate) {
          events.push({
            id: crypto.randomUUID(),
            warningActionId: activeCase.id,
            eventType: "WARNING_DETECTED",
            systemGenerated: true,
            sourceRunId: run.id,
            idempotencyKey: eventKey(activeCase.id, run.id, "WARNING_DETECTED"),
            details: { warningResultId: result.id, businessStatus: result.businessStatus },
          });
        }
        if (previousBusinessStatus !== result.businessStatus) {
          events.push({
            id: crypto.randomUUID(),
            warningActionId: activeCase.id,
            eventType: "RISK_STATUS_CHANGED",
            systemGenerated: true,
            sourceRunId: run.id,
            idempotencyKey: eventKey(activeCase.id, run.id, "RISK_STATUS_CHANGED"),
            details: { from: previousBusinessStatus, to: result.businessStatus, warningResultId: result.id },
          });
        }
        if (events.length) await tx.warningActionEvent.createMany({ data: events, skipDuplicates: true });
        return "updated" as const;
      });
    } catch (error) {
      if (attempt === 0 && isUniqueConstraintError(error)) continue;
      throw error;
    }
  }
  return "unchanged" as const;
}

export class InterventionCasesService {
  static async list(filters: InterventionQueueFilters, actor: Actor) {
    const scopedRows = await scopedQueueRows(actor, filters);
    // Tab Cần can thiệp mặc định chỉ chứa Vàng/Đỏ hiện hành. Hồ sơ đã
    // vượt khỏi ngưỡng vẫn được giữ nguyên để tra cứu lịch sử; trạng thái
    // "Hoàn tất" của can thiệp không tự thay đổi kết quả cảnh báo học vụ.
    const rows = filters.businessStatus || filters.status === "RESOLVED"
      ? scopedRows
      : scopedRows.filter((row) => isInterventionTriggerStatus(row.latestBusinessStatus));
    rows.sort((left, right) => {
      const leftPriority = queuePriority(left.interventionStatus, left.latestBusinessStatus, left.overdue);
      const rightPriority = queuePriority(right.interventionStatus, right.latestBusinessStatus, right.overdue);
      for (let index = 0; index < leftPriority.length; index++) {
        if (leftPriority[index] !== rightPriority[index]) return leftPriority[index] - rightPriority[index];
      }
      const detected = (right.lastDetectedAt?.getTime() || 0) - (left.lastDetectedAt?.getTime() || 0);
      return detected || left.caseId.localeCompare(right.caseId);
    });
    const total = rows.length;
    const skip = (filters.page - 1) * filters.pageSize;
    return {
      items: rows.slice(skip, skip + filters.pageSize),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(total / filters.pageSize),
    };
  }

  static async summary(actor: Actor) {
    const rows = (await scopedQueueRows(actor))
      .filter((row) => isInterventionTriggerStatus(row.latestBusinessStatus));
    const counts = {
      open: 0,
      inProgress: 0,
      resolved: 0,
      escalated: 0,
      reopened: 0,
      overdue: 0,
      highRisk: 0,
      verifyRequired: 0,
    };
    const byClass = new Map<string, {
      classId: string;
      classCode: string | null;
      open: number;
      inProgress: number;
      overdue: number;
      highRisk: number;
      verifyRequired: number;
    }>();
    for (const row of rows) {
      if (row.interventionStatus === "OPEN") counts.open++;
      else if (row.interventionStatus === "IN_PROGRESS") counts.inProgress++;
      else if (row.interventionStatus === "RESOLVED") counts.resolved++;
      else if (row.interventionStatus === "ESCALATED") counts.escalated++;
      else if (row.interventionStatus === "REOPENED") counts.reopened++;
      if (row.overdue) counts.overdue++;
      if (row.latestBusinessStatus === "HIGH_RISK") counts.highRisk++;
      if (row.latestBusinessStatus === "VERIFY_REQUIRED") counts.verifyRequired++;
      if (row.student.classId) {
        const group = byClass.get(row.student.classId) || {
          classId: row.student.classId,
          classCode: row.student.classCode,
          open: 0,
          inProgress: 0,
          overdue: 0,
          highRisk: 0,
          verifyRequired: 0,
        };
        if (row.interventionStatus === "OPEN") group.open++;
        if (row.interventionStatus === "IN_PROGRESS") group.inProgress++;
        if (row.overdue) group.overdue++;
        if (row.latestBusinessStatus === "HIGH_RISK") group.highRisk++;
        if (row.latestBusinessStatus === "VERIFY_REQUIRED") group.verifyRequired++;
        byClass.set(row.student.classId, group);
      }
    }
    return {
      ...counts,
      total: rows.length,
      ...(actorHasRole(actor, "faculty_manager") ? {
        byClass: [...byClass.values()].sort((left, right) => (left.classCode || "").localeCompare(right.classCode || "")),
      } : {}),
    };
  }

  static async getDetail(caseId: string, actor: Actor) {
    const [queueCase] = await scopedQueueRows(actor, { caseId });
    if (!queueCase) throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
    const [result, history] = await Promise.all([
      queueCase.latestWarningResultId
        ? prisma.academicWarningStudentResult.findUnique({
            where: { id: queueCase.latestWarningResultId },
            select: {
              id: true,
              businessStatus: true,
              regulatoryCoverage: true,
              ruleResults: true,
            },
          })
        : null,
      loadWarningActionHistory([caseId]),
    ]);
    const reasons = result
      ? await prisma.academicWarningReason.findMany({
          where: { studentResultId: result.id },
          orderBy: [{ severity: "desc" }, { reasonCode: "asc" }],
        })
      : [];
    return {
      case: queueCase,
      currentWarning: result ? {
        resultId: result.id,
        businessStatus: normalizeWarningBusinessStatus(result.businessStatus),
        regulatoryCoverage: result.regulatoryCoverage,
        ruleResults: result.ruleResults,
        reasons: reasons.map((reason) => {
          const details = jsonObject(reason.details);
          return {
            reasonCode: reason.reasonCode,
            severity: reason.severity,
            title: reason.title,
            observedValue: details.observedValue ?? null,
            thresholdValue: details.thresholdValue ?? null,
            nearThreshold: details.isNearThreshold ?? false,
            thresholdBreached: details.isThresholdBreached ?? false,
            sourceType: reason.sourceType,
            articleReference: details.articleRef ?? null,
            notEvaluatedReason: details.notEvaluatedReason ?? details.reasonCode ?? null,
            details,
          };
        }),
      } : null,
      history,
      activities: history.flatMap((event) => {
        if (event.eventType !== "INTERVENTION_RECORDED") return [];
        const details = jsonObject(event.details);
        return [{
          eventId: event.id,
          interventionType: details.interventionType ?? null,
          occurredAt: details.occurredAt ?? null,
          content: details.content ?? null,
          result: details.result ?? null,
          note: details.note ?? null,
          nextFollowUpAt: details.nextFollowUpAt ?? null,
          actor: event.actor,
          createdAt: event.createdAt,
        }];
      }),
    };
  }

  static async syncInterventionCasesForRun(runId: string): Promise<SyncResult> {
    const run = await prisma.academicWarningRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        runMode: true,
        assessmentAcademicTermId: true,
        completedAt: true,
      },
    });
    if (!run) throw new ApiError("Academic warning run not found", "NOT_FOUND", 404);
    if (run.status !== "completed" || run.runMode !== "OFFICIAL") {
      throw new ApiError("Only completed OFFICIAL warning runs can create intervention cases", "INVALID_WARNING_RUN", 409);
    }

    const triggerResults = await prisma.academicWarningStudentResult.findMany({
      where: { runId, businessStatus: { in: [...INTERVENTION_TRIGGER_STATUSES] } },
      select: { id: true, studentId: true, classId: true, businessStatus: true },
    });
    const activeCaseStudents = await prisma.warningAction.findMany({
      where: {
        caseType: EARLY_WARNING_CASE_TYPE,
        status: { in: [...ACTIVE_INTERVENTION_STATUSES] },
      },
      select: { studentId: true },
    });
    const activeStudentIds = [...new Set(activeCaseStudents.map((item) => item.studentId))];
    const nonTriggerResults = activeStudentIds.length
      ? await prisma.academicWarningStudentResult.findMany({
          where: {
            runId,
            studentId: { in: activeStudentIds },
            businessStatus: { notIn: [...INTERVENTION_TRIGGER_STATUSES] },
          },
          select: { id: true, studentId: true, classId: true, businessStatus: true },
        })
      : [];
    const persistedResults = [...triggerResults, ...nonTriggerResults];
    const summary: SyncResult = {
      runId,
      processedResults: persistedResults.length,
      createdCases: 0,
      updatedCases: 0,
      unchangedResults: 0,
    };
    for (const result of persistedResults) {
      const outcome = await syncPersistedResult(run, result);
      if (outcome === "created") summary.createdCases++;
      else if (outcome === "updated") summary.updatedCases++;
      else summary.unchangedResults++;
    }
    return summary;
  }

  static async transitionStatus(caseId: string, nextStatus: string, actor: Actor) {
    const scopedCase = await assertCanMutateInterventionCase(caseId, actor);
    const currentStatus = parseWarningActionStatus(scopedCase.status);
    const status = parseWarningActionStatus(nextStatus);
    assertWarningActionTransition(currentStatus, status);
    if (status === currentStatus) return prisma.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const changed = await tx.warningAction.updateMany({
        where: { id: caseId, caseType: EARLY_WARNING_CASE_TYPE, status: currentStatus },
        data: {
          status,
          resolvedAt: status === "RESOLVED" ? now : currentStatus === "RESOLVED" ? null : undefined,
          updatedAt: now,
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("Intervention case changed concurrently; reload and retry", "CONCURRENT_UPDATE", 409);
      }
      await tx.warningActionEvent.create({
        data: {
          warningActionId: caseId,
          eventType: "STATUS_CHANGED",
          actorUserId: actor.userId,
          systemGenerated: false,
          details: { from: currentStatus, to: status },
        },
      });
      if (status === "RESOLVED" || status === "REOPENED") {
        await tx.warningActionEvent.create({
          data: {
            warningActionId: caseId,
            eventType: status === "RESOLVED" ? "CASE_RESOLVED" : "CASE_REOPENED",
            actorUserId: actor.userId,
            systemGenerated: false,
            details: { from: currentStatus, to: status },
          },
        });
      }
      return tx.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  static async recordIntervention(caseId: string, data: {
    interventionType: string;
    occurredAt: Date | string;
    content: string;
    result?: string | null;
    note?: string | null;
    nextFollowUpAt?: Date | string | null;
  }, actor: Actor) {
    const scopedCase = await assertCanMutateInterventionCase(caseId, actor);
    const interventionType = data.interventionType as InterventionType;
    if (!INTERVENTION_TYPES.includes(interventionType)) {
      throw new ApiError(`interventionType must be one of: ${INTERVENTION_TYPES.join(", ")}`, "INVALID_INTERVENTION_TYPE", 400);
    }
    const content = data.content.trim();
    if (!content) throw new ApiError("content is required", "INVALID_REQUEST", 400);
    const occurredAt = parseDateTime(data.occurredAt, "occurredAt");
    const nextFollowUpAt = data.nextFollowUpAt == null
      ? data.nextFollowUpAt
      : parseDateTime(data.nextFollowUpAt, "nextFollowUpAt");
    const currentStatus = parseWarningActionStatus(scopedCase.status);
    if (currentStatus === "RESOLVED") {
      throw new ApiError("Reopen a resolved case before recording an intervention", "INVALID_STATUS_TRANSITION", 409);
    }
    const status: WarningActionStatus = currentStatus === "OPEN" ? "IN_PROGRESS" : currentStatus;
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const changed = await tx.warningAction.updateMany({
        where: { id: caseId, caseType: EARLY_WARNING_CASE_TYPE, status: currentStatus },
        data: {
          status,
          ...(data.nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt ?? null } : {}),
          updatedAt: now,
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("Intervention case changed concurrently; reload and retry", "CONCURRENT_UPDATE", 409);
      }
      if (status !== currentStatus) {
        await tx.warningActionEvent.create({
          data: {
            warningActionId: caseId,
            eventType: "STATUS_CHANGED",
            actorUserId: actor.userId,
            systemGenerated: false,
            details: { from: currentStatus, to: status, reason: "FIRST_INTERVENTION" },
          },
        });
      }
      await tx.warningActionEvent.create({
        data: {
          warningActionId: caseId,
          eventType: "INTERVENTION_RECORDED",
          actorUserId: actor.userId,
          systemGenerated: false,
          details: {
            interventionType,
            occurredAt: occurredAt.toISOString(),
            content,
            result: data.result?.trim() || null,
            note: data.note?.trim() || null,
            nextFollowUpAt: nextFollowUpAt?.toISOString() || null,
          },
        },
      });
      if (nextFollowUpAt) {
        await tx.warningActionEvent.create({
          data: {
            warningActionId: caseId,
            eventType: "FOLLOW_UP_SCHEDULED",
            actorUserId: actor.userId,
            systemGenerated: false,
            details: { nextFollowUpAt: nextFollowUpAt.toISOString() },
          },
        });
      }
      return tx.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  static async setFollowUp(caseId: string, value: Date | string | null, actor: Actor) {
    const scopedCase = await assertCanMutateInterventionCase(caseId, actor);
    const nextFollowUpAt = value === null ? null : parseDateTime(value, "nextFollowUpAt");
    if (scopedCase.nextFollowUpAt?.getTime() === nextFollowUpAt?.getTime() ||
      (scopedCase.nextFollowUpAt === null && nextFollowUpAt === null)) {
      return prisma.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    }
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const changed = await tx.warningAction.updateMany({
        where: { id: caseId, caseType: EARLY_WARNING_CASE_TYPE, updatedAt: scopedCase.updatedAt },
        data: { nextFollowUpAt, updatedAt: now },
      });
      if (changed.count !== 1) {
        throw new ApiError("Intervention case changed concurrently; reload and retry", "CONCURRENT_UPDATE", 409);
      }
      await tx.warningActionEvent.create({
        data: {
          warningActionId: caseId,
          eventType: "FOLLOW_UP_SCHEDULED",
          actorUserId: actor.userId,
          systemGenerated: false,
          details: {
            previousNextFollowUpAt: scopedCase.nextFollowUpAt?.toISOString() || null,
            nextFollowUpAt: nextFollowUpAt?.toISOString() || null,
            cleared: nextFollowUpAt === null,
          },
        },
      });
      return tx.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  static async assign(caseId: string, assignedUserId: string, actor: Actor) {
    if (!hasPermission(actor, "academic_warning.case.assign")) {
      throw new ApiError("Assignment permission is required", "FORBIDDEN", 403);
    }
    const canAssign = actorHasRole(actor, "admin") || actorHasScope(actor, "system") ||
      (actorHasRole(actor, "faculty_manager") && actorHasScope(actor, "faculty"));
    if (!canAssign) throw new ApiError("Assignment permission is required", "FORBIDDEN", 403);
    const [queueCase] = await scopedQueueRows(actor, { caseId });
    if (!queueCase) throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
    if (!queueCase.student.classId || !queueCase.assessmentAcademicTermId) {
      throw new ApiError("Case has incomplete class or academic-term provenance", "INVALID_ASSIGNMENT", 409);
    }
    const [target, advisorRole] = await Promise.all([
      prisma.user.findFirst({
        where: { id: assignedUserId, isActive: true, deletedAt: null },
        select: { id: true },
      }),
      prisma.role.findUnique({ where: { code: "class_advisor" }, select: { id: true } }),
    ]);
    if (!target || !advisorRole) {
      throw new ApiError("Target user is not an active class advisor", "INVALID_ASSIGNEE", 400);
    }
    const [roleMembership, assignment] = await Promise.all([
      prisma.userRole.findUnique({
        where: { userId_roleId: { userId: assignedUserId, roleId: advisorRole.id } },
        select: { userId: true },
      }),
      prisma.classAdvisorAssignment.findFirst({
        where: {
          userId: assignedUserId,
          classId: queueCase.student.classId,
          academicTermId: queueCase.assessmentAcademicTermId,
          status: "active",
          revokedAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!roleMembership || !assignment) {
      throw new ApiError("Target advisor is not assigned to this class and academic term", "INVALID_ASSIGNEE", 400);
    }
    const current = await prisma.warningAction.findUnique({
      where: { id: caseId },
      select: { assignedUserId: true, updatedAt: true },
    });
    if (!current) throw new ApiError("Intervention case not found", "NOT_FOUND", 404);
    if (current.assignedUserId === assignedUserId) return prisma.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    const previousAssignedUserId = current.assignedUserId;
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const changed = await tx.warningAction.updateMany({
        where: { id: caseId, caseType: EARLY_WARNING_CASE_TYPE, updatedAt: current.updatedAt },
        data: { assignedUserId, updatedAt: now },
      });
      if (changed.count !== 1) {
        throw new ApiError("Intervention case changed concurrently; reload and retry", "CONCURRENT_UPDATE", 409);
      }
      await tx.warningActionEvent.create({
        data: {
          warningActionId: caseId,
          eventType: previousAssignedUserId ? "REASSIGNED" : "ASSIGNED",
          actorUserId: actor.userId,
          systemGenerated: false,
          details: { previousAssignedUserId, assignedUserId },
        },
      });
      return tx.warningAction.findUniqueOrThrow({ where: { id: caseId } });
    });
  }
}
