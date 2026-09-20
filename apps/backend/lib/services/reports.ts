import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";

type WarningLevel = "high" | "medium" | "none";

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
};

const numberOrNull = (value: unknown) => value == null ? null : Number(value);

type WarningTrendTerm = {
  id: string;
  academicYear: string;
  termCode: string;
  termOrder: number;
  label: string;
  isSummer?: boolean;
};

type WarningTrendSummary = {
  studentId: string;
  academicTermId: string;
  gpa4: unknown;
  cumulativeGpa4: unknown;
};

type WarningTrendDecision = {
  studentId: string;
  academicTermId: string;
};

const MIN_REPORTING_TERM_GPA_COVERAGE = 0.8;

export function summarizeWarningTrend(
  rows: WarningTrendSummary[],
  termGpaThreshold: number,
  cumulativeGpaThreshold: number,
  decisionStudentIds: ReadonlySet<string> = new Set(),
) {
  let high = 0;
  let medium = 0;
  let evaluated = 0;
  let available = 0;
  let termGpaAvailable = 0;
  let cumulativeGpaAvailable = 0;
  const summarizedStudentIds = new Set<string>();
  const summaryByStudent = new Map(rows.map((summary) => [summary.studentId, summary]));

  for (const summary of summaryByStudent.values()) {
    summarizedStudentIds.add(summary.studentId);
    const termGpa = numberOrNull(summary.gpa4);
    const cumulative = numberOrNull(summary.cumulativeGpa4);
    if (termGpa != null || cumulative != null) available += 1;
    if (termGpa != null) termGpaAvailable += 1;
    if (cumulative != null) cumulativeGpaAvailable += 1;

    if (decisionStudentIds.has(summary.studentId)) {
      high += 1;
      evaluated += 1;
    } else if (cumulative != null && cumulative < cumulativeGpaThreshold) {
      high += 1;
      evaluated += 1;
    } else if (termGpa != null && termGpa < termGpaThreshold) {
      medium += 1;
      evaluated += 1;
    } else if (termGpa != null && cumulative != null) {
      evaluated += 1;
    }
  }

  // A source decision is itself a high-severity warning even when that
  // student does not yet have a GPA summary.
  for (const studentId of decisionStudentIds) {
    if (!summarizedStudentIds.has(studentId)) {
      high += 1;
      evaluated += 1;
      available += 1;
    }
  }

  return { high, medium, evaluated, available, termGpaAvailable, cumulativeGpaAvailable };
}

export function selectLatestReportingPeriod<TrendPoint extends { termGpaAvailable: number; isSummer?: boolean }>(
  trend: TrendPoint[],
  studentCount: number,
  minimumCoverage = MIN_REPORTING_TERM_GPA_COVERAGE,
) {
  if (!trend.length || studentCount <= 0) return null;
  const mainTerms = trend.filter((point) => !point.isSummer);
  const sufficientlyCovered = mainTerms.filter(
    (point) => point.termGpaAvailable / studentCount >= minimumCoverage,
  );
  // Automated reporting always excludes configured summer terms. Coverage is
  // still used to avoid selecting an incomplete current main term.
  return sufficientlyCovered.at(-1)
    || mainTerms.filter((point) => point.termGpaAvailable > 0).at(-1)
    || null;
}

export function buildWarningTrend(
  terms: WarningTrendTerm[],
  summaries: WarningTrendSummary[],
  decisions: WarningTrendDecision[],
  termGpaThreshold: number,
  cumulativeGpaThreshold: number,
) {
  const sortedTerms = [...terms].sort((left, right) =>
    `${left.academicYear}|${String(left.termOrder).padStart(2, "0")}`.localeCompare(
      `${right.academicYear}|${String(right.termOrder).padStart(2, "0")}`,
    ),
  );
  const summariesByTerm = new Map<string, WarningTrendSummary[]>();
  const decisionsByTerm = new Map<string, WarningTrendDecision[]>();

  for (const summary of summaries) {
    const rows = summariesByTerm.get(summary.academicTermId) || [];
    rows.push(summary);
    summariesByTerm.set(summary.academicTermId, rows);
  }
  for (const decision of decisions) {
    const rows = decisionsByTerm.get(decision.academicTermId) || [];
    rows.push(decision);
    decisionsByTerm.set(decision.academicTermId, rows);
  }

  return sortedTerms.flatMap((term) => {
    const periodSummaries = summariesByTerm.get(term.id) || [];
    const periodDecisions = decisionsByTerm.get(term.id) || [];

    // Every bar represents that exact term. Prior-term warnings are not
    // carried forward and configured future terms without data are omitted.
    if (!periodSummaries.length && !periodDecisions.length) return [];
    return [{
      academicTermId: term.id,
      academicYear: term.academicYear,
      termCode: term.termCode,
      termOrder: term.termOrder,
      label: term.label,
      isSummer: Boolean(term.isSummer),
      ...summarizeWarningTrend(
        periodSummaries,
        termGpaThreshold,
        cumulativeGpaThreshold,
        new Set(periodDecisions.map((decision) => decision.studentId)),
      ),
    }];
  });
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
      page?: number;
      pageSize?: number;
    } = {},
    studentScope: Prisma.StudentWhereInput = {},
  ) {
    const page = Math.max(1, filters.page || 1);
    // API routes still cap public pagination at 100. Internal consumers such as
    // the student list may request the complete warning set for accurate filters.
    const pageSize = Math.min(1000, Math.max(1, filters.pageSize || 20));
    const cohortClassCodes = filters.cohortId
      ? (await prisma.class.findMany({ where: { cohortId: filters.cohortId, deletedAt: null }, select: { classId: true } }))
          .map((item) => item.classId)
      : undefined;
    const [students, policy, terms, years, classes] = await Promise.all([
      prisma.student.findMany({
        where: { AND: [
          { deletedAt: null },
          studentScope,
          filters.programCode ? { sStudyProgramId: filters.programCode } : {},
          cohortClassCodes ? { sClassStudentId: { in: cohortClassCodes } } : {},
        ] },
        select: {
          id: true,
          sStudentId: true,
          sFullName: true,
          sClassStudentId: true,
          sStudyProgramId: true,
        },
      }),
      prisma.academicWarningPolicy.findFirst({
        where: { status: "active" },
        orderBy: { version: "desc" },
      }),
      prisma.academicTerm.findMany({ where: { deletedAt: null } }),
      prisma.academicYear.findMany({ where: { deletedAt: null } }),
      prisma.class.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { classId: "asc" } }),
    ]);

    const studentIds = students.map((student) => student.id);
    if (!policy) {
      throw new ApiError(
        "No active academic warning policy is configured. Activate a versioned policy before viewing reports.",
        "WARNING_POLICY_REQUIRED",
        503,
      );
    }
    const reportTerms = filters.academicYearId
      ? terms.filter((term) => term.academicYearId === filters.academicYearId)
      : terms;
    const reportTermIds = reportTerms.map((term) => term.id);
    const [termSummaries, warningDecisions, actions] = studentIds.length
      ? await Promise.all([
          prisma.studentTermSummary.findMany({
            where: {
              studentId: { in: studentIds },
              ...(filters.academicYearId ? { academicTermId: { in: reportTermIds } } : {}),
            },
          }),
          prisma.studentDecision.findMany({
            where: {
              studentId: { in: studentIds },
              deletedAt: null,
              isAcademicWarning: true,
              ...(filters.academicYearId ? { academicTermId: { in: reportTermIds } } : {}),
            },
            select: { studentId: true, academicTermId: true },
          }),
          prisma.warningAction.findMany({
            where: { studentId: { in: studentIds }, status: "RESOLVED" },
            select: { studentId: true },
          }),
        ])
      : [[], [], []];

    const termMap = new Map(terms.map((term) => [term.id, term]));
    const yearMap = new Map(years.map((year) => [year.id, year]));
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const scopedTermSummaries: typeof termSummaries = [];
    for (const summary of termSummaries) {
      const student = studentMap.get(summary.studentId);
      if (student?.sStudyProgramId && summary.sProgramCode !== student.sStudyProgramId) continue;
      scopedTermSummaries.push(summary);
    }
    const resolvedCounts = new Map<string, number>();
    for (const action of actions) {
      resolvedCounts.set(action.studentId, (resolvedCounts.get(action.studentId) || 0) + 1);
    }

    const termGpaThreshold = Number(policy.termGpaThreshold);
    const cumulativeGpaThreshold = Number(policy.cumulativeGpaThreshold);
    const completeTrend = buildWarningTrend(
      reportTerms.map((term) => {
        const academicYear = yearMap.get(term.academicYearId)?.sYearCode || "";
        return {
          id: term.id,
          academicYear,
          termCode: term.sTermCode,
          termOrder: term.sTermOrder,
          label: `${term.sTermCode} (${academicYear})`,
          isSummer: term.sIsSummer,
        };
      }),
      scopedTermSummaries,
      warningDecisions,
      termGpaThreshold,
      cumulativeGpaThreshold,
    );
    const requestedTerm = filters.academicTermId ? termMap.get(filters.academicTermId) : null;
    if (filters.academicTermId && !requestedTerm) {
      throw new ApiError("Academic term not found", "INVALID_ACADEMIC_TERM", 400);
    }
    if (requestedTerm && filters.academicYearId && requestedTerm.academicYearId !== filters.academicYearId) {
      throw new ApiError("Academic term does not belong to the selected academic year", "INVALID_ACADEMIC_TERM", 400);
    }
    const summerParticipants = requestedTerm?.sIsSummer && studentIds.length
      ? await prisma.studentCourseOffering.findMany({
          where: { academicTermId: requestedTerm.id, studentId: { in: studentIds } },
          distinct: ["studentId"],
          select: { studentId: true },
        })
      : [];
    const latestPeriod = requestedTerm
      ? completeTrend.find((point) => point.academicTermId === requestedTerm.id) || {
          academicTermId: requestedTerm.id,
          academicYear: yearMap.get(requestedTerm.academicYearId)?.sYearCode || "",
          termCode: requestedTerm.sTermCode,
          termOrder: requestedTerm.sTermOrder,
          label: `${requestedTerm.sTermCode} (${yearMap.get(requestedTerm.academicYearId)?.sYearCode || ""})`,
          isSummer: requestedTerm.sIsSummer,
          high: 0,
          medium: 0,
          evaluated: 0,
          available: 0,
          termGpaAvailable: 0,
          cumulativeGpaAvailable: 0,
        }
      : selectLatestReportingPeriod(completeTrend, students.length);
    const reportingPeriodIndex = latestPeriod
      ? completeTrend.findIndex((point) => point.academicTermId === latestPeriod.academicTermId)
      : -1;
    const trend = (reportingPeriodIndex >= 0 ? completeTrend.slice(0, reportingPeriodIndex + 1) : [])
      .filter((point) => point.termGpaAvailable > 0)
      .filter((point) => requestedTerm?.sIsSummer ? true : !point.isSummer)
      .slice(-5);
    const latestTerm = latestPeriod ? termMap.get(latestPeriod.academicTermId) : null;
    const latestYear = latestTerm ? yearMap.get(latestTerm.academicYearId) : null;
    const periodSummaryByStudent = new Map(
      scopedTermSummaries
        .filter((summary) => summary.academicTermId === latestPeriod?.academicTermId)
        .map((summary) => [summary.studentId, summary]),
    );
    const periodDecisionCounts = new Map<string, number>();
    for (const decision of warningDecisions) {
      if (decision.academicTermId !== latestPeriod?.academicTermId) continue;
      periodDecisionCounts.set(decision.studentId, (periodDecisionCounts.get(decision.studentId) || 0) + 1);
    }

    const evaluatedStudents: WarningStudent[] = students.map((student) => {
      const summary = periodSummaryByStudent.get(student.id);
      const termGpa4 = numberOrNull(summary?.gpa4);
      const cumulativeGpa4 = numberOrNull(summary?.cumulativeGpa4);
      const decisionCount = periodDecisionCounts.get(student.id) || 0;
      const reasonCodes: string[] = [];
      let severity: WarningLevel = "none";
      if (termGpa4 != null && termGpa4 < termGpaThreshold) {
        reasonCodes.push("LOW_TERM_GPA");
        severity = "medium";
      }
      if (cumulativeGpa4 != null && cumulativeGpa4 < cumulativeGpaThreshold) {
        reasonCodes.push("LOW_CUMULATIVE_GPA");
        severity = "high";
      }
      if (decisionCount > 0) {
        reasonCodes.push("ACADEMIC_WARNING_DECISION");
        severity = "high";
      }
      const assessed = severity !== "none" || (termGpa4 != null && cumulativeGpa4 != null);
      return {
        studentId: student.id,
        studentCode: student.sStudentId,
        studentName: student.sFullName,
        classCode: student.sClassStudentId || "Chưa phân lớp",
        programCode: student.sStudyProgramId || "",
        termGpa4,
        cumulativeGpa4,
        severity,
        reasonCodes,
        reasonCount: reasonCodes.length,
        academicWarningDecisions: decisionCount,
        resolvedActions: resolvedCounts.get(student.id) || 0,
        academicYear: latestYear?.sYearCode || null,
        termCode: latestTerm?.sTermCode || null,
        assessed,
      };
    });

    const warningStudents = evaluatedStudents.filter((student) => student.severity !== "none");
    const classBreakdown = classes
      .map((studentClass) => {
        const classStudents = students.filter((student) => student.sClassStudentId === studentClass.classId);
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
        };
      })
      .filter((item) => item.totalStudents > 0);

    const search = filters.search?.trim().toLocaleLowerCase("vi-VN") || "";
    const filtered = warningStudents
      .filter((student) => !filters.severity || student.severity === filters.severity)
      .filter((student) => !filters.classCode || student.classCode === filters.classCode)
      .filter((student) => !search || `${student.studentCode} ${student.studentName}`.toLocaleLowerCase("vi-VN").includes(search))
      .sort((left, right) => {
        const severityOrder = { high: 0, medium: 1, none: 2 };
        return severityOrder[left.severity] - severityOrder[right.severity]
          || left.classCode.localeCompare(right.classCode)
          || left.studentCode.localeCompare(right.studentCode);
      });
    const offset = (page - 1) * pageSize;
    const evaluated = evaluatedStudents.filter((student) => student.assessed).length;
    const available = evaluatedStudents.filter((student) =>
      student.termGpa4 != null || student.cumulativeGpa4 != null || student.academicWarningDecisions > 0,
    ).length;
    const termGpaAvailable = evaluatedStudents.filter((student) => student.termGpa4 != null).length;
    const cumulativeGpaAvailable = evaluatedStudents.filter((student) => student.cumulativeGpa4 != null).length;
    const high = warningStudents.filter((student) => student.severity === "high").length;
    const medium = warningStudents.filter((student) => student.severity === "medium").length;
    const safe = evaluatedStudents.filter((student) => student.assessed && student.severity === "none").length;

    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize),
      counts: {
        students: students.length,
        evaluated,
        available,
        termGpaAvailable,
        cumulativeGpaAvailable,
        unassessed: students.length - evaluated,
        high,
        medium,
        safe,
      },
      policy: {
        id: policy.id,
        name: policy.name,
        version: policy.version,
        status: policy.status,
        activatedBy: policy.createdBy,
        termGpaThreshold,
        cumulativeGpaThreshold,
        configured: true,
      },
      mode: {
        code: requestedTerm?.sIsSummer ? "summer_descriptive_monitoring" : "live_gpa_decision",
        label: requestedTerm?.sIsSummer
          ? "Số liệu mô tả kỳ phụ, không phải kết luận cảnh báo chính thức"
          : "Cảnh báo live theo GPA và quyết định",
        reasonCodes: ["LOW_TERM_GPA", "LOW_CUMULATIVE_GPA", "ACADEMIC_WARNING_DECISION"],
        excludes: ["REGISTRATION_BEHIND", "PROGRAM_PROGRESS_BEHIND"],
        periodSelection: requestedTerm ? "explicit_filter" : "latest_non_summer_term_with_80_percent_term_gpa_coverage",
        generatedAt: new Date().toISOString(),
      },
      latestPeriod,
      trend,
      classBreakdown,
      reportContext: {
        isSummer: Boolean(requestedTerm?.sIsSummer),
        classification: requestedTerm?.sIsSummer ? "descriptive" : "official_main_term",
        participantStudents: requestedTerm?.sIsSummer ? summerParticipants.length : latestPeriod?.available || 0,
        scopedStudents: students.length,
        coverage: students.length
          ? (requestedTerm?.sIsSummer ? summerParticipants.length : latestPeriod?.available || 0) / students.length
          : 0,
        note: requestedTerm?.sIsSummer
          ? "Số liệu mô tả, không phải kết quả xếp hạng học lực độc lập."
          : null,
      },
      filterOptions: {
        terms: reportTerms
          .slice()
          .sort((left, right) => {
            const leftYear = yearMap.get(left.academicYearId)?.sYearCode || "";
            const rightYear = yearMap.get(right.academicYearId)?.sYearCode || "";
            return `${rightYear}|${String(right.sTermOrder).padStart(2, "0")}`.localeCompare(
              `${leftYear}|${String(left.sTermOrder).padStart(2, "0")}`,
            );
          })
          .map((term) => ({
            value: term.id,
            label: `${term.sTermCode} (${yearMap.get(term.academicYearId)?.sYearCode || ""})`,
            isSummer: term.sIsSummer,
          })),
      },
    };
  }
}
