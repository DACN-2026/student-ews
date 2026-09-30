import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import {
  warningDataStatusFromStored,
  warningPresentationState,
  type WarningDataStatus,
} from "@/lib/services/academic-warning-rules";
import { compareAcademicTerms } from "@/lib/academic-terms";

type WarningLevel = "high" | "medium" | "none";

type PersistedWarningRow = {
  studentId: string;
  maxSeverity: string;
  reasonCount: number;
  dataError: string | null;
  termGpa4?: unknown;
  cumulativeGpa4?: unknown;
  businessStatus?: string | null;
};

type PersistedBusinessStatus = "NORMAL" | "PARTIAL_NO_RISK" | "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED" | "INSUFFICIENT_DATA";

type WarningStudent = {
  studentId: string;
  studentCode: string;
  studentName: string;
  classCode: string;
  programCode: string;
  termGpa4: number | null;
  cumulativeGpa4: number | null;
  severity: WarningLevel;
  reasonCodes: string[];
  reasonCount: number;
  academicWarningDecisions: number;
  resolvedActions: number;
  academicYear: string | null;
  termCode: string | null;
  assessed: boolean;
  dataStatus: WarningDataStatus;
  presentationState: PersistedBusinessStatus;
  hasPersistedResult: boolean;
};

const numberOrNull = (value: unknown) => value == null ? null : Number(value);

function persistedBusinessStatus(row: PersistedWarningRow, dataStatus: WarningDataStatus): PersistedBusinessStatus {
  if (["NORMAL", "PARTIAL_NO_RISK", "MONITORING", "HIGH_RISK", "VERIFY_REQUIRED", "INSUFFICIENT_DATA"].includes(row.businessStatus || "")) {
    return row.businessStatus as PersistedBusinessStatus;
  }
  return warningPresentationState({ maxSeverity: row.maxSeverity, reasonCount: row.reasonCount, dataStatus });
}

export function summarizePersistedWarningResults(rows: PersistedWarningRow[]) {
  let high = 0;
  let medium = 0;
  let evaluated = 0;
  let available = 0;
  let termGpaAvailable = 0;
  let cumulativeGpaAvailable = 0;
  let insufficient = 0;
  for (const row of rows) {
    const dataStatus = warningDataStatusFromStored(row.dataError);
    const state = persistedBusinessStatus(row, dataStatus);
    if (row.termGpa4 != null) termGpaAvailable += 1;
    if (row.cumulativeGpa4 != null) cumulativeGpaAvailable += 1;
    if (dataStatus !== "INSUFFICIENT") available += 1;
    if (state === "HIGH_RISK" || state === "VERIFY_REQUIRED") high += 1;
    if (state === "MONITORING") medium += 1;
    if (state === "INSUFFICIENT_DATA") insufficient += 1;
    else evaluated += 1;
  }
  return { high, medium, evaluated, available, termGpaAvailable, cumulativeGpaAvailable, insufficient };
}

export function summarizeWarningBusinessStatuses(rows: PersistedWarningRow[]) {
  const counts = {
    NORMAL: 0,
    PARTIAL_NO_RISK: 0,
    MONITORING: 0,
    HIGH_RISK: 0,
    VERIFY_REQUIRED: 0,
    INSUFFICIENT_DATA: 0,
  };
  for (const row of rows) {
    const dataStatus = warningDataStatusFromStored(row.dataError);
    counts[persistedBusinessStatus(row, dataStatus)] += 1;
  }
  return counts;
}

export function selectLatestReportingPeriod<TrendPoint extends { evaluated: number; insufficient?: number; isSummer?: boolean }>(trend: TrendPoint[]) {
  return trend
    .filter((point) => !point.isSummer && (point.evaluated > 0 || (point.insufficient || 0) > 0))
    .at(-1) || null;
}

export function describeAcademicWarningReportEvaluationState(
  studentCount: number,
  rows: PersistedWarningRow[],
  hasCompletedOfficialRun: boolean,
) {
  const persistedStudentIds = new Set(rows.map((row) => row.studentId));
  const persistedCounts = summarizePersistedWarningResults(rows);
  return {
    hasCompletedOfficialRun,
    persistedResultCount: persistedStudentIds.size,
    persistedInsufficientDataCount: persistedCounts.insufficient,
    noPersistedResultCount: Math.max(0, studentCount - persistedStudentIds.size),
  };
}

function latestRunsPerScope<TRun extends {
  cohortId: string;
  trainingProgramId: string;
  assessmentAcademicTermId: string;
}>(runs: TRun[]) {
  const latest = new Map<string, TRun>();
  for (const run of runs) {
    const key = `${run.cohortId}:${run.trainingProgramId}:${run.assessmentAcademicTermId}`;
    if (!latest.has(key)) latest.set(key, run);
  }
  return [...latest.values()];
}

export class ReportsService {
  static async academicWarningStudents(
    filters: {
      severity?: string;
      classCode?: string;
      search?: string;
      academicTermId?: string;
      academicYearId?: string;
      cohortId?: string;
      programCode?: string;
      presentationState?: WarningStudent["presentationState"];
      includeAllStates?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
    studentScope: Prisma.StudentWhereInput = {},
  ) {
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(1000, Math.max(1, filters.pageSize || 20));
    const cohortClassCodes = filters.cohortId
      ? (await prisma.class.findMany({ where: { cohortId: filters.cohortId, deletedAt: null }, select: { classId: true } }))
          .map((item) => item.classId)
      : undefined;
    const [students, terms, years, classes, policies, programs] = await Promise.all([
      prisma.student.findMany({
        where: { AND: [
          { deletedAt: null },
          studentScope,
          filters.programCode ? { sStudyProgramId: filters.programCode } : {},
          cohortClassCodes ? { sClassStudentId: { in: cohortClassCodes } } : {},
        ] },
        select: { id: true, sStudentId: true, sFullName: true, sClassStudentId: true, sStudyProgramId: true },
      }),
      prisma.academicTerm.findMany({ where: { deletedAt: null } }),
      prisma.academicYear.findMany({ where: { deletedAt: null } }),
      prisma.class.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { classId: "asc" } }),
      prisma.academicWarningPolicy.findMany({ orderBy: [{ version: "desc" }, { createdAt: "desc" }] }),
      filters.programCode
        ? prisma.trainingProgram.findMany({ where: { sProgramCode: filters.programCode, deletedAt: null }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const termMap = new Map(terms.map((term) => [term.id, term]));
    const yearMap = new Map(years.map((year) => [year.id, year]));
    const activePolicy = policies.find((policy) => policy.status === "active") || null;
    const qd600Policy = policies.find((policy) => {
      const definition = policy.policyDefinition;
      return definition !== null && !Array.isArray(definition) && typeof definition === "object" &&
        definition.evaluationProfile === "QD600_ARTICLE_18";
    }) || null;
    const requestedTerm = filters.academicTermId ? termMap.get(filters.academicTermId) : null;
    if (filters.academicTermId && !requestedTerm) {
      throw new ApiError("Academic term not found", "INVALID_ACADEMIC_TERM", 400);
    }
    if (requestedTerm && filters.academicYearId && requestedTerm.academicYearId !== filters.academicYearId) {
      throw new ApiError("Academic term does not belong to the selected academic year", "INVALID_ACADEMIC_TERM", 400);
    }
    if (requestedTerm?.sIsSummer) {
      throw new ApiError(
        "Summer terms are outside the Early Academic Warning workflow",
        "SUMMER_EARLY_WARNING_OUT_OF_SCOPE",
        422,
      );
    }

    const mainTerms = terms.filter((term) => !term.sIsSummer);
    const reportTerms = filters.academicYearId ? mainTerms.filter((term) => term.academicYearId === filters.academicYearId) : mainTerms;
    const reportTermIds = reportTerms.map((term) => term.id);
    const runs = await prisma.academicWarningRun.findMany({
      where: {
        status: "completed",
        runMode: "OFFICIAL",
        ...(filters.academicTermId
          ? { assessmentAcademicTermId: filters.academicTermId }
          : filters.academicYearId ? { assessmentAcademicTermId: { in: reportTermIds } } : {}),
        ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
        ...(filters.programCode ? { trainingProgramId: { in: programs.map((program) => program.id) } } : {}),
      },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }, { id: "desc" }],
    });
    const latestRuns = latestRunsPerScope(runs);
    const studentIds = students.map((student) => student.id);
    const allResults = latestRuns.length && studentIds.length
      ? await prisma.academicWarningStudentResult.findMany({
          where: { runId: { in: latestRuns.map((run) => run.id) }, studentId: { in: studentIds } },
        })
      : [];
    const resultRunIds = new Set(allResults.map((result) => result.runId));
    const availableRuns = latestRuns.filter((run) => resultRunIds.has(run.id));
    const asComparable = (term: (typeof terms)[number]) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      academicYearCode: yearMap.get(term.academicYearId)?.sYearCode || "",
      termOrder: term.sTermOrder,
      isSummer: term.sIsSummer,
      startDate: term.startDate,
      endDate: term.endDate,
    });
    const orderedTerms = reportTerms.slice().sort((left, right) => compareAcademicTerms(asComparable(left), asComparable(right)));
    const trend = orderedTerms.flatMap((term) => {
      const periodRunIds = new Set(availableRuns.filter((run) => run.assessmentAcademicTermId === term.id).map((run) => run.id));
      const rows = allResults.filter((result) => periodRunIds.has(result.runId));
      if (!rows.length) return [];
      return [{
        academicTermId: term.id,
        academicYear: yearMap.get(term.academicYearId)?.sYearCode || "",
        termCode: term.sTermCode,
        termOrder: term.sTermOrder,
        label: `${term.sTermCode} (${yearMap.get(term.academicYearId)?.sYearCode || ""})`,
        isSummer: term.sIsSummer,
        ...summarizePersistedWarningResults(rows),
      }];
    });
    const latestPeriod = requestedTerm
      ? trend.find((point) => point.academicTermId === requestedTerm.id) || {
          academicTermId: requestedTerm.id,
          academicYear: yearMap.get(requestedTerm.academicYearId)?.sYearCode || "",
          termCode: requestedTerm.sTermCode,
          termOrder: requestedTerm.sTermOrder,
          label: `${requestedTerm.sTermCode} (${yearMap.get(requestedTerm.academicYearId)?.sYearCode || ""})`,
          isSummer: requestedTerm.sIsSummer,
          high: 0, medium: 0, evaluated: 0, available: 0,
          termGpaAvailable: 0, cumulativeGpaAvailable: 0, insufficient: 0,
        }
      : selectLatestReportingPeriod(trend);
    const selectedTerm = latestPeriod ? termMap.get(latestPeriod.academicTermId) : null;
    const selectedYear = selectedTerm ? yearMap.get(selectedTerm.academicYearId) : null;
    const selectedRunIds = new Set(availableRuns
      .filter((run) => run.assessmentAcademicTermId === selectedTerm?.id)
      .map((run) => run.id));
    const runOrder = new Map(availableRuns.map((run, index) => [run.id, index]));
    const selectedResults = allResults
      .filter((result) => selectedRunIds.has(result.runId))
      .sort((left, right) => (runOrder.get(left.runId) ?? 9999) - (runOrder.get(right.runId) ?? 9999));
    const resultByStudent = new Map<string, (typeof selectedResults)[number]>();
    for (const result of selectedResults) if (!resultByStudent.has(result.studentId)) resultByStudent.set(result.studentId, result);
    const selectedResultIds = [...resultByStudent.values()].map((result) => result.id);
    const [reasons, actions] = await Promise.all([
      selectedResultIds.length
        ? prisma.academicWarningReason.findMany({
            where: { studentResultId: { in: selectedResultIds } },
          select: { studentResultId: true, reasonCode: true },
          })
        : [],
      studentIds.length
        ? prisma.warningAction.findMany({
            where: { studentId: { in: studentIds }, status: "RESOLVED" },
            select: { studentId: true },
          })
        : [],
    ]);
    const reasonCodesByResult = new Map<string, string[]>();
    for (const reason of reasons) {
      const values = reasonCodesByResult.get(reason.studentResultId) || [];
      values.push(reason.reasonCode);
      reasonCodesByResult.set(reason.studentResultId, values);
    }
    const resolvedCounts = new Map<string, number>();
    for (const action of actions) resolvedCounts.set(action.studentId, (resolvedCounts.get(action.studentId) || 0) + 1);

    const evaluatedStudents: WarningStudent[] = students.map((student) => {
      const result = resultByStudent.get(student.id);
      const dataStatus = result ? warningDataStatusFromStored(result.dataError) : "INSUFFICIENT";
      const presentationState = result
        ? persistedBusinessStatus(result, dataStatus)
        : "INSUFFICIENT_DATA";
      const severity: WarningLevel = presentationState === "HIGH_RISK" || presentationState === "VERIFY_REQUIRED"
        ? "high"
        : presentationState === "MONITORING" ? "medium" : "none";
      return {
        studentId: student.id,
        studentCode: result?.sStudentId || student.sStudentId,
        studentName: result?.sStudentName || student.sFullName,
        classCode: student.sClassStudentId || "Chưa phân lớp",
        programCode: student.sStudyProgramId || "",
        termGpa4: numberOrNull(result?.termGpa4),
        cumulativeGpa4: numberOrNull(result?.cumulativeGpa4),
        severity,
        reasonCodes: result ? reasonCodesByResult.get(result.id) || [] : [],
        reasonCount: result?.reasonCount || 0,
        academicWarningDecisions: result?.academicWarningDecisions || 0,
        resolvedActions: resolvedCounts.get(student.id) || 0,
        academicYear: selectedYear?.sYearCode || null,
        termCode: selectedTerm?.sTermCode || null,
        assessed: presentationState !== "INSUFFICIENT_DATA",
        dataStatus,
        presentationState,
        hasPersistedResult: Boolean(result),
      };
    });
    const warningStudents = evaluatedStudents.filter((student) => student.severity !== "none");
    const classBreakdown = classes.map((studentClass) => {
      const classStudents = students.filter((student) => student.sClassStudentId === studentClass.classId);
      const classEvaluations = evaluatedStudents.filter((student) =>
        student.classCode === studentClass.classId && student.hasPersistedResult,
      );
      const classWarnings = warningStudents.filter((student) => student.classCode === studentClass.classId);
      const high = classWarnings.filter((student) => student.severity === "high").length;
      const medium = classWarnings.filter((student) => student.severity === "medium").length;
      return {
        classCode: studentClass.classId,
        className: studentClass.className,
        totalStudents: classStudents.length,
        high,
        medium,
        warningStudents: high + medium,
        warningRate: classStudents.length ? Math.round(((high + medium) / classStudents.length) * 100) : 0,
        evaluated: classEvaluations.length,
        normal: classEvaluations.filter((student) => student.presentationState === "NORMAL").length,
        partialNoRisk: classEvaluations.filter((student) => student.presentationState === "PARTIAL_NO_RISK").length,
        monitoring: classEvaluations.filter((student) => student.presentationState === "MONITORING").length,
        highRisk: classEvaluations.filter((student) => student.presentationState === "HIGH_RISK").length,
        verifyRequired: classEvaluations.filter((student) => student.presentationState === "VERIFY_REQUIRED").length,
        insufficientData: classEvaluations.filter((student) => student.presentationState === "INSUFFICIENT_DATA").length,
      };
    }).filter((item) => item.totalStudents > 0);
    const search = filters.search?.trim().toLocaleLowerCase("vi-VN") || "";
    const severityOrder: Record<WarningLevel, number> = { high: 0, medium: 1, none: 2 };
    const reportStudents = filters.includeAllStates
      ? evaluatedStudents.filter((student) => student.hasPersistedResult)
      : warningStudents;
    const filtered = reportStudents
      .filter((student) => !filters.severity || student.severity === filters.severity)
      .filter((student) => !filters.presentationState || student.presentationState === filters.presentationState)
      .filter((student) => !filters.classCode || student.classCode === filters.classCode)
      .filter((student) => !search || `${student.studentCode} ${student.studentName}`.toLocaleLowerCase("vi-VN").includes(search))
      .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]
        || left.classCode.localeCompare(right.classCode)
        || left.studentCode.localeCompare(right.studentCode));
    const offset = (page - 1) * pageSize;
    const counts = summarizePersistedWarningResults([...resultByStudent.values()]);
    const businessStatusCounts = summarizeWarningBusinessStatuses([...resultByStudent.values()]);
    const safe = evaluatedStudents.filter((student) => student.presentationState === "NORMAL").length;
    const sourceRun = availableRuns.find((run) => run.assessmentAcademicTermId === selectedTerm?.id) || null;
    const evaluationState = describeAcademicWarningReportEvaluationState(
      students.length,
      [...resultByStudent.values()],
      Boolean(sourceRun),
    );
    const sourcePolicy = sourceRun?.policyId
      ? await prisma.academicWarningPolicy.findUnique({ where: { id: sourceRun.policyId } })
      : null;
    const policy = sourcePolicy || qd600Policy || activePolicy;
    if (!policy) {
      throw new ApiError(
        "No persisted or active academic warning policy is available for this report.",
        "WARNING_POLICY_REQUIRED",
        503,
      );
    }

    return {
      hasCompletedOfficialRun: evaluationState.hasCompletedOfficialRun,
      evaluationState,
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize),
      counts: {
        students: students.length,
        evaluated: counts.evaluated,
        available: counts.available,
        termGpaAvailable: counts.termGpaAvailable,
        cumulativeGpaAvailable: counts.cumulativeGpaAvailable,
        unassessed: students.length - counts.evaluated,
        high: counts.high,
        medium: counts.medium,
        safe,
        businessStatus: businessStatusCounts,
      },
      policy: {
          id: sourceRun?.policyId || policy.id,
          name: policy.name,
          version: sourceRun?.policyVersion || policy.version,
          status: sourceRun ? "snapshotted" : policy.status,
          activatedBy: policy.createdBy,
          termGpaThreshold: Number(policy.termGpaThreshold),
          cumulativeGpaThreshold: Number(policy.cumulativeGpaThreshold),
          configured: true,
          displayName: sourceRun?.executionProfile === "QD600_PARTIAL_REGULATORY" || policy.id === qd600Policy?.id
            ? "QĐ 600/QĐ-ĐHĐL — Điều 18"
            : policy.name,
          evaluationScope: sourceRun?.executionProfile === "QD600_PARTIAL_REGULATORY" || policy.id === qd600Policy?.id
            ? "Đánh giá một phần"
            : "Legacy",
      },
      mode: {
        code: "official_warning_run",
        label: "OFFICIAL từ kết quả AcademicWarningRun đã lưu",
        source: "OFFICIAL",
        runIds: availableRuns.filter((run) => run.assessmentAcademicTermId === selectedTerm?.id).map((run) => run.id),
        evaluator: sourceRun?.executionProfile || "QD600_PARTIAL_REGULATORY",
        periodSelection: requestedTerm ? "explicit_filter" : "latest_main_term_with_completed_official_run",
        generatedAt: new Date().toISOString(),
      },
      latestPeriod,
      trend: trend.filter((point) => !point.isSummer).slice(-5),
      classBreakdown,
      reportContext: {
        hasCompletedOfficialRun: evaluationState.hasCompletedOfficialRun,
        persistedResultCount: evaluationState.persistedResultCount,
        persistedInsufficientDataCount: evaluationState.persistedInsufficientDataCount,
        noPersistedResultCount: evaluationState.noPersistedResultCount,
        isSummer: false,
        classification: "official",
        participantStudents: resultByStudent.size,
        scopedStudents: students.length,
        coverage: students.length ? resultByStudent.size / students.length : 0,
        note: sourceRun ? null : "Chưa có AcademicWarningRun chính thức hoàn tất cho phạm vi đã chọn.",
      },
      filterOptions: {
        terms: orderedTerms.slice().reverse().map((term) => ({
          value: term.id,
          label: `${term.sTermCode} (${yearMap.get(term.academicYearId)?.sYearCode || ""})`,
          isSummer: term.sIsSummer,
          gradesFinalizedAt: term.gradesFinalizedAt,
        })),
      },
    };
  }
}
