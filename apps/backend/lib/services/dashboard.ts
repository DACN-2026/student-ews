import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ReportsService } from "@/lib/services/reports";
import { buildAcademicTermLinks } from "@/lib/academic-terms";

interface DashboardFilters {
  academicYear?: string;
  termCode?: string;
  programCode?: string;
  classId?: string;
  gpaScope?: string;
  gpaAggregation?: string;
  page?: number;
  pageSize?: number;
  cohortId?: string;
  trainingProgramId?: string;
  academicTermId?: string;
  warningLevel?: string;
  supportStatus?: string;
}

type WarningSnapshot = {
  runId: string;
  studentId: string;
  classId: string | null;
  cohortId: string | null;
  sStudentId: string;
  sStudentName: string;
  sClassName: string | null;
  sProgramCode: string | null;
  termGpa4: Prisma.Decimal | null;
  cumulativeGpa4: Prisma.Decimal | null;
  registrationStatus: string;
  scheduleStatus: string;
  maxSeverity: string;
  reasonCount: number;
};

const availableMetric = (value: number, numerator?: number, denominator?: number) => ({
  value,
  ...(numerator === undefined ? {} : { numerator }),
  ...(denominator === undefined ? {} : { denominator }),
  status: "available",
});

const unavailableMetric = () => ({
  value: null,
  status: "unavailable",
  reason: "Chưa có dữ liệu cho bộ lọc đã chọn.",
});

function percentage(pass: number, total: number) {
  return total ? availableMetric((pass * 100) / total, pass, total) : unavailableMetric();
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function decimalNumber(value: Prisma.Decimal | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function progressPoint(
  code: string,
  name: string,
  rows: WarningSnapshot[],
  field: "scheduleStatus" | "registrationStatus",
) {
  const values = rows.map((row) => row[field]);
  if (field === "scheduleStatus") {
    return {
      code,
      name,
      total: rows.length,
      pass: values.filter((value) => value === "on_track").length,
      fail: values.filter((value) => value === "behind_schedule").length,
      pending: values.filter((value) => value === "pending_result").length,
      error: values.filter((value) => value === "data_error" || value === "no_due_plan").length,
    };
  }
  return {
    code,
    name,
    total: rows.length,
    pass: values.filter((value) => value === "pass").length,
    fail: values.filter((value) => value === "fail").length,
    pending: values.filter((value) => value === "pending").length,
    error: values.filter((value) => value === "data_error").length,
  };
}

export class DashboardService {
  static async getSummary(
    filters: DashboardFilters = {},
    studentScope: Prisma.StudentWhereInput = {},
    warningScope: Prisma.AcademicWarningRunWhereInput = {},
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 100) : 10;
    const gpaScope = filters.gpaScope === "term" && filters.academicYear && filters.termCode
      ? "term"
      : "cumulative";
    const gpaAggregation = filters.gpaAggregation === "average" ? "average" : "median";

    const selectedProgram = filters.trainingProgramId
      ? await prisma.trainingProgram.findFirst({ where: { id: filters.trainingProgramId, deletedAt: null } })
      : filters.programCode
        ? await prisma.trainingProgram.findFirst({ where: { sProgramCode: filters.programCode, deletedAt: null } })
        : null;

    const filteredClasses = filters.classId || filters.cohortId
      ? await prisma.class.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            ...(filters.classId ? { id: filters.classId } : {}),
            ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
          },
        })
      : null;
    const supportConditions: Prisma.StudentWhereInput[] = [];
    if (filters.supportStatus) {
      const actions = await prisma.warningAction.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { studentId: true, status: true },
      });
      const latestByStudent = new Map<string, string>();
      for (const action of actions) {
        if (!latestByStudent.has(action.studentId)) latestByStudent.set(action.studentId, action.status);
      }
      if (filters.supportStatus === "NONE") {
        supportConditions.push({ id: { notIn: [...latestByStudent.keys()] } });
      } else {
        supportConditions.push({ id: { in: [...latestByStudent]
          .filter(([, status]) => status === filters.supportStatus)
          .map(([studentId]) => studentId) } });
      }
    }
    const studentWhere: Prisma.StudentWhereInput = {
      AND: [
        { deletedAt: null },
        studentScope,
        ...(filters.trainingProgramId || filters.programCode
          ? [{ sStudyProgramId: selectedProgram ? selectedProgram.sProgramCode : { in: [] } }]
          : []),
        ...(filteredClasses ? [{ sClassStudentId: { in: filteredClasses.map((item) => item.classId) } }] : []),
        ...supportConditions,
      ],
    };
    const scopedStudents = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true, sClassStudentId: true, sStudyProgramId: true },
    });
    const scopedStudentIds = scopedStudents.map((student) => student.id);

    let selectedYear = filters.academicYear
      ? await prisma.academicYear.findFirst({ where: { sYearCode: filters.academicYear, deletedAt: null } })
      : null;
    let selectedTerm = filters.academicTermId
      ? await prisma.academicTerm.findFirst({ where: { id: filters.academicTermId, deletedAt: null } })
      : null;
    if (!selectedTerm && selectedYear && filters.termCode) {
      selectedTerm = await prisma.academicTerm.findFirst({
        where: { academicYearId: selectedYear.id, sTermCode: filters.termCode.toUpperCase(), deletedAt: null },
      });
    }
    if (selectedTerm && !selectedYear) {
      selectedYear = await prisma.academicYear.findFirst({ where: { id: selectedTerm.academicYearId, deletedAt: null } });
    }

    const hasExplicitTermFilter = Boolean(filters.academicTermId || filters.termCode);
    const liveWarningReport = await ReportsService.academicWarningStudents(
      {
        page,
        pageSize,
        academicTermId: hasExplicitTermFilter ? selectedTerm?.id || "__invalid_term__" : undefined,
        academicYearId: selectedYear?.id,
        severity: filters.warningLevel,
      },
      studentWhere,
    );
    if (!hasExplicitTermFilter && liveWarningReport.latestPeriod) {
      selectedTerm = await prisma.academicTerm.findFirst({
        where: { id: liveWarningReport.latestPeriod.academicTermId, deletedAt: null },
      });
      if (selectedTerm) {
        selectedYear = await prisma.academicYear.findFirst({
          where: { id: selectedTerm.academicYearId, deletedAt: null },
        });
      }
    }
    const directGpaRows = !scopedStudentIds.length
      ? []
      : gpaScope === "term"
        ? selectedTerm
          ? (await prisma.studentTermSummary.findMany({
              where: { studentId: { in: scopedStudentIds }, academicTermId: selectedTerm.id },
              select: { studentId: true, sProgramCode: true, gpa4: true },
            })).map((row) => ({ ...row, value: row.gpa4 }))
          : []
        : (await prisma.studentCumulativeSummary.findMany({
            where: { studentId: { in: scopedStudentIds } },
            orderBy: { refreshedAt: "desc" },
            select: { studentId: true, sProgramCode: true, cumulativeGpa4: true },
          })).map((row) => ({
            studentId: row.studentId,
            sProgramCode: row.sProgramCode,
            value: row.cumulativeGpa4,
          }));
    const scopedStudentMap = new Map(scopedStudents.map((student) => [student.id, student]));
    const directGpaByStudent = new Map<string, number>();
    for (const row of directGpaRows) {
      if (directGpaByStudent.has(row.studentId)) continue;
      const student = scopedStudentMap.get(row.studentId);
      if (student?.sStudyProgramId && row.sProgramCode && student.sStudyProgramId !== row.sProgramCode) continue;
      const value = decimalNumber(row.value);
      if (value !== null) directGpaByStudent.set(row.studentId, value);
    }

    const conductRows = selectedTerm && scopedStudentIds.length
      ? await prisma.studentConductRecord.findMany({
          where: { studentId: { in: scopedStudentIds }, academicTermId: selectedTerm.id },
          select: { id: true, studentId: true, sClassStudentId: true, statusId: true, lastScore: true },
        })
      : [];
    const approvedConduct = conductRows.flatMap((row) =>
      row.statusId === "1" && row.lastScore != null
        ? [{ ...row, score: Number(row.lastScore) }]
        : [],
    );
    const conductValues = approvedConduct.map((row) => row.score);
    const conductGroups = [
      { name: "Xuất sắc", min: 90, max: 101 },
      { name: "Tốt", min: 80, max: 90 },
      { name: "Khá", min: 65, max: 80 },
      { name: "Trung bình", min: 50, max: 65 },
      { name: "Yếu", min: 35, max: 50 },
      { name: "Kém", min: 0, max: 35 },
    ].map((group) => ({
      name: group.name,
      count: conductValues.filter((score) => score >= group.min && score < group.max).length,
    }));

    const [gpaHistoryRows, chronologyTerms, chronologyYears] = await Promise.all([scopedStudentIds.length ? prisma.$queryRaw<Array<{
      student_id: string;
      academic_term_id: string;
      s_program_code: string;
      gpa_4: unknown;
      s_year_code: string;
      s_term_code: string;
      s_term_order: number;
      s_is_summer: boolean;
    }>>`
      SELECT s.student_id::text, s.academic_term_id::text, s.s_program_code, s.gpa_4,
             y.s_year_code, t.s_term_code, t.s_term_order, t.s_is_summer
      FROM student_term_summaries s
      JOIN academic_terms t ON t.id = s.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE s.student_id = ANY(${scopedStudentIds}::uuid[]) AND s.gpa_4 IS NOT NULL
      ORDER BY y.s_year_code, t.s_term_order
    ` : Promise.resolve([]),
    prisma.academicTerm.findMany({ where: { deletedAt: null } }),
    prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
    ]);
    const chronologyYearCodes = new Map(chronologyYears.map((year) => [year.id, year.sYearCode]));
    const termLinks = buildAcademicTermLinks(chronologyTerms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      academicYearCode: chronologyYearCodes.get(term.academicYearId) || "",
      termOrder: term.sTermOrder,
      isSummer: term.sIsSummer,
      startDate: term.startDate,
      endDate: term.endDate,
    })));
    const chronologyTermMap = new Map(chronologyTerms.map((term) => [term.id, term]));
    const trendGroups = new Map<string, {
      label: string;
      academicYear: string;
      termCode: string;
      order: string;
      isSummer: boolean;
      values: number[];
    }>();
    for (const row of gpaHistoryRows) {
      const student = scopedStudentMap.get(row.student_id);
      if (student?.sStudyProgramId && row.s_program_code !== student.sStudyProgramId) continue;
      const key = row.academic_term_id;
      const group = trendGroups.get(key) || {
        label: `${row.s_term_code} ${row.s_year_code}`,
        academicYear: row.s_year_code,
        termCode: row.s_term_code,
        order: `${row.s_year_code}|${String(row.s_term_order).padStart(2, "0")}`,
        isSummer: row.s_is_summer,
        values: [],
      };
      group.values.push(Number(row.gpa_4));
      trendGroups.set(key, group);
    }
    const selectedOrder = selectedTerm && selectedYear
      ? `${selectedYear.sYearCode}|${String(selectedTerm.sTermOrder).padStart(2, "0")}`
      : null;
    const gpaTrend = [...trendGroups.values()]
      .filter((group) => !selectedOrder || group.order <= selectedOrder)
      .sort((left, right) => left.order.localeCompare(right.order))
      .slice(-8)
      .map((group) => {
        const average = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
        const termId = [...trendGroups].find(([, candidate]) => candidate === group)?.[0] || null;
        const links = termId ? termLinks.get(termId) : null;
        const relatedMain = links?.previousMainTermId ? chronologyTermMap.get(links.previousMainTermId) : null;
        return {
          academicTermId: termId,
          label: group.label,
          academicYear: group.academicYear,
          termCode: group.termCode,
          isSummer: group.isSummer,
          average,
          officialAverage: group.isSummer ? null : average,
          descriptiveSummerAverage: group.isSummer ? average : null,
          studentCount: group.values.length,
          count: group.values.length,
          coverage: scopedStudents.length ? group.values.length / scopedStudents.length : 0,
          calculationMode: group.isSummer ? "raw_summer_descriptive" : "source_term_summary",
          mergedIntoMainTerm: relatedMain ? {
            academicTermId: relatedMain.id,
            termCode: relatedMain.sTermCode,
            academicYear: chronologyYearCodes.get(relatedMain.academicYearId) || null,
            status: "source_merge_unverified",
          } : null,
        };
      });

    const warningFilter: Prisma.AcademicWarningRunWhereInput = {
      status: "completed",
      ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
    };
    if (filters.trainingProgramId || filters.programCode) {
      warningFilter.trainingProgramId = selectedProgram ? selectedProgram.id : { in: [] };
    }
    if (filters.academicTermId || filters.academicYear || filters.termCode || selectedTerm) {
      warningFilter.assessmentAcademicTermId = selectedTerm ? selectedTerm.id : { in: [] };
    }

    const [years, programs, allVisibleClasses, cohorts, completedRuns] = await Promise.all([
      prisma.academicYear.findMany({ where: { deletedAt: null }, orderBy: { sYearCode: "desc" } }),
      prisma.trainingProgram.findMany({ where: { deletedAt: null, status: "active" }, orderBy: { sProgramName: "asc" } }),
      prisma.class.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { className: "asc" } }),
      prisma.cohort.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { sCohortName: "asc" } }),
      prisma.academicWarningRun.findMany({
        where: {
          AND: [
            warningFilter,
            warningScope,
          ],
        },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        take: 500,
      }),
    ]);

    const latestRunByScope = new Map<string, (typeof completedRuns)[number]>();
    for (const run of completedRuns) {
      const key = `${run.cohortId}:${run.trainingProgramId}:${run.assessmentAcademicTermId}`;
      if (!latestRunByScope.has(key)) latestRunByScope.set(key, run);
    }
    const latestRuns = [...latestRunByScope.values()];
    const warningRows: WarningSnapshot[] = latestRuns.length && scopedStudentIds.length
      ? await prisma.academicWarningStudentResult.findMany({
          where: { runId: { in: latestRuns.map((run) => run.id) }, studentId: { in: scopedStudentIds } },
          select: {
            runId: true,
            studentId: true,
            classId: true,
            cohortId: true,
            sStudentId: true,
            sStudentName: true,
            sClassName: true,
            sProgramCode: true,
            termGpa4: true,
            cumulativeGpa4: true,
            registrationStatus: true,
            scheduleStatus: true,
            maxSeverity: true,
            reasonCount: true,
          },
        })
      : [];
    const latestWarningByStudent = new Map<string, WarningSnapshot>();
    for (const row of warningRows) {
      if (!latestWarningByStudent.has(row.studentId)) latestWarningByStudent.set(row.studentId, row);
    }
    const latestWarnings = [...latestWarningByStudent.values()];
    const classCodes = new Set(scopedStudents.map((student) => student.sClassStudentId).filter(Boolean));
    const programCodes = new Set(scopedStudents.map((student) => student.sStudyProgramId).filter(Boolean));
    const classes = allVisibleClasses.filter((item) => classCodes.has(item.classId));
    const red = liveWarningReport.counts.high;
    const yellow = liveWarningReport.counts.medium;
    const warningStudents = red + yellow;

    const gpaValues = [...directGpaByStudent.values()];
    const averageGpa = gpaValues.length
      ? gpaValues.reduce((sum, value) => sum + value, 0) / gpaValues.length
      : null;
    const aggregateGpa = gpaAggregation === "average" ? averageGpa : median(gpaValues);

    const gradeGroups = new Map<string, number>();
    for (const value of gpaValues) {
      const name = value >= 3.6 ? "Xuất sắc" : value >= 3.2 ? "Giỏi" : value >= 2.5 ? "Khá" : value >= 2 ? "Trung bình" : "Yếu";
      gradeGroups.set(name, (gradeGroups.get(name) || 0) + 1);
    }
    const gradeDistribution = [...gradeGroups].map(([name, count]) => ({
      name,
      count,
      rate: gpaValues.length ? Number(((count * 100) / gpaValues.length).toFixed(1)) : 0,
    }));

    const byCohort = cohorts.map((cohort) => progressPoint(
      cohort.sCohortCode,
      cohort.sCohortName,
      latestWarnings.filter((row) => row.cohortId === cohort.id),
      "scheduleStatus",
    )).filter((item) => item.total > 0);
    const byProgram = programs.map((program) => progressPoint(
      program.sProgramCode,
      program.sProgramName,
      latestWarnings.filter((row) => row.sProgramCode === program.sProgramCode),
      "scheduleStatus",
    )).filter((item) => item.total > 0);
    const registrationByCohort = cohorts.map((cohort) => progressPoint(
      cohort.sCohortCode,
      cohort.sCohortName,
      latestWarnings.filter((row) => row.cohortId === cohort.id),
      "registrationStatus",
    )).filter((item) => item.total > 0);
    const registrationByProgram = programs.map((program) => progressPoint(
      program.sProgramCode,
      program.sProgramName,
      latestWarnings.filter((row) => row.sProgramCode === program.sProgramCode),
      "registrationStatus",
    )).filter((item) => item.total > 0);

    const gpaByClass = classes.map((item) => {
      const values = scopedStudents
        .filter((student) => student.sClassStudentId === item.classId)
        .map((student) => directGpaByStudent.get(student.id))
        .filter((value): value is number => value !== undefined);
      const value = gpaAggregation === "average"
        ? (values.length ? values.reduce((sum, current) => sum + current, 0) / values.length : null)
        : median(values);
      return { classId: item.classId, className: item.className, value, count: values.length };
    });

    const scheduleAll = progressPoint("all", "Toàn Khoa", latestWarnings, "scheduleStatus");
    const registrationAll = progressPoint("all", "Toàn Khoa", latestWarnings, "registrationStatus");
    const graduationForecastTotal = scheduleAll.pass + scheduleAll.fail + scheduleAll.pending;
    const currentYear = selectedYear || years.find((year) => year.isCurrent) || null;
    const terms = currentYear
      ? await prisma.academicTerm.findMany({ where: { academicYearId: currentYear.id, deletedAt: null }, orderBy: { sTermOrder: "asc" } })
      : [];
    const activeClassCodes = new Set(allVisibleClasses.map((item) => item.classId));
    const studentsWithoutClass = scopedStudents.filter((student) => !student.sClassStudentId || !activeClassCodes.has(student.sClassStudentId)).length;
    const selectedTermParticipants = selectedTerm && scopedStudentIds.length
      ? await prisma.studentCourseOffering.findMany({
          where: { academicTermId: selectedTerm.id, studentId: { in: scopedStudentIds } },
          distinct: ["studentId"],
          select: { studentId: true },
        })
      : [];
    const selectedTermLinks = selectedTerm ? termLinks.get(selectedTerm.id) : null;

    const sweResponse = {
      studentCount: scopedStudents.length,
      classCount: classes.length,
      currentAcademicYear: currentYear ? { id: currentYear.id, yearCode: currentYear.sYearCode } : null,
      alerts: [{ code: "STUDENT_WITHOUT_ACTIVE_CLASS", count: studentsWithoutClass, severity: "warning" }],
      generatedAt: new Date().toISOString(),
      filter: {
        ...(currentYear ? { academicYear: currentYear.sYearCode } : {}),
        ...(selectedTerm ? { termCode: selectedTerm.sTermCode } : {}),
        ...(selectedProgram ? { programCode: selectedProgram.sProgramCode } : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.warningLevel ? { warningLevel: filters.warningLevel } : {}),
        ...(filters.supportStatus ? { supportStatus: filters.supportStatus } : {}),
        gpaScope,
        gpaAggregation,
      },
      metrics: {
        studentCount: availableMetric(scopedStudents.length),
        classCount: availableMetric(classes.length),
        averageGpa: aggregateGpa === null ? unavailableMetric() : availableMetric(aggregateGpa, gpaValues.length, gpaValues.length),
        completionRate: percentage(scheduleAll.pass, scheduleAll.total),
        registrationRate: percentage(registrationAll.pass, registrationAll.total),
        warningStudents: availableMetric(warningStudents, warningStudents, scopedStudents.length),
        graduationForecastRate: percentage(scheduleAll.pass, graduationForecastTotal),
        averageConductScore: conductValues.length
          ? availableMetric(conductValues.reduce((sum, score) => sum + score, 0) / conductValues.length, conductValues.length, scopedStudents.length)
          : unavailableMetric(),
      },
      gradeDistribution,
      gpaTrend,
      cohortProgress: [scheduleAll, ...byCohort],
      programProgress: [scheduleAll, ...byProgram],
      conductByClass: classes.map((item) => {
        const values = approvedConduct.filter((row) => row.sClassStudentId === item.classId).map((row) => row.score);
        return { classId: item.classId, className: item.className, median: median(values), count: values.length };
      }),
      conductDistribution: conductGroups,
      gpaByClass,
      registrationProgress: [registrationAll, ...registrationByCohort],
      programRegistrationProgress: [registrationAll, ...registrationByProgram],
      graduationForecast: {
        total: graduationForecastTotal,
        onTime: scheduleAll.pass,
        conditional: scheduleAll.pending,
        incomplete: scheduleAll.fail,
        cannotDetermine: scheduleAll.error,
      },
      academicWarnings: {
        items: liveWarningReport.items.map((row) => ({
          studentId: row.studentId,
          studentCode: row.studentCode,
          studentName: row.studentName,
          className: row.classCode,
          programCode: row.programCode,
          termGpa: row.termGpa4,
          cumulativeGpa: row.cumulativeGpa4,
          registrationStatus: "unassessed",
          scheduleStatus: "unassessed",
          severity: row.severity,
          reasonCount: row.reasonCount,
        })),
        total: liveWarningReport.total,
        page,
        pageSize,
      },
      dataContext: {
        gpa: {
          mode: gpaScope === "term" ? "term_summary" : "latest_cumulative_summary",
          academicTermId: gpaScope === "term" ? selectedTerm?.id || null : null,
          periodLabel: gpaScope === "term" && selectedTerm
            ? `${currentYear?.sYearCode || ""} ${selectedTerm.sTermCode}`.trim()
            : "Tích lũy mới nhất theo từng sinh viên",
          aggregation: gpaAggregation,
          availableStudents: gpaValues.length,
        },
        warnings: {
          ...liveWarningReport.mode,
          academicTermId: liveWarningReport.latestPeriod?.academicTermId || null,
          periodLabel: liveWarningReport.latestPeriod?.label || null,
          policy: liveWarningReport.policy,
          evaluatedStudents: liveWarningReport.counts.evaluated,
          unassessedStudents: liveWarningReport.counts.unassessed,
        },
        progress: {
          code: "warning_run_snapshot",
          label: "Đăng ký và tiến độ từ lần tính cảnh báo theo run",
          academicTermId: selectedTerm?.id || null,
          runIds: latestRuns.map((run) => run.id),
          cutoff: latestRuns[0]?.sourceCapturedAt || latestRuns[0]?.completedAt || null,
          reasonCodes: ["REGISTRATION_BEHIND", "PROGRAM_PROGRESS_BEHIND"],
        },
        conduct: {
          academicTermId: selectedTerm?.id || null,
          periodLabel: selectedTerm ? `${currentYear?.sYearCode || ""} ${selectedTerm.sTermCode}`.trim() : null,
          approvedStudents: conductValues.length,
          pendingStudents: conductRows.filter((row) => row.statusId === "0").length,
          missingStudents: Math.max(0, scopedStudents.length - conductRows.length),
          recognizedField: "lastScore",
          isSummer: Boolean(selectedTerm?.sIsSummer),
          evaluationTermId: selectedTerm?.sIsSummer ? selectedTermLinks?.nextMainTermId || null : selectedTerm?.id || null,
          note: selectedTerm?.sIsSummer
            ? "Nội dung phát sinh trong kỳ hè được dùng khi đánh giá kỳ chính tiếp theo."
            : null,
        },
        graduationForecast: {
          academicTermId: selectedTerm?.id || null,
          assessedStudents: graduationForecastTotal,
          onTime: scheduleAll.pass,
          behindSchedule: scheduleAll.fail,
          pending: scheduleAll.pending,
          cannotDetermine: scheduleAll.error,
        },
      },
      filterOptions: {
        academicYears: years.map((year) => ({ value: year.sYearCode, label: year.sYearCode })),
        terms: terms.map((term) => ({
          value: term.sTermCode,
          label: term.sTermName,
          isSummer: term.sIsSummer,
          previousMainTermId: termLinks.get(term.id)?.previousMainTermId || null,
          nextMainTermId: termLinks.get(term.id)?.nextMainTermId || null,
        })),
        programs: programs
          .filter((program) => programCodes.has(program.sProgramCode))
          .map((program) => ({ value: program.sProgramCode, label: program.sProgramName })),
        classes: classes.map((item) => ({ value: item.id, label: item.className })),
        warningLevels: [
          { value: "high", label: "Đỏ" },
          { value: "medium", label: "Vàng" },
        ],
        supportStatuses: [
          { value: "NONE", label: "Chưa hỗ trợ" },
          { value: "OPEN", label: "Mở" },
          { value: "IN_PROGRESS", label: "Đang xử lý" },
          { value: "ESCALATED", label: "Đã chuyển cấp" },
          { value: "REOPENED", label: "Mở lại" },
          { value: "RESOLVED", label: "Đã giải quyết" },
        ],
      },
    };

    return {
      ...sweResponse,
      totalStudents: scopedStudents.length,
      totalClasses: classes.length,
      totalPrograms: new Set(scopedStudents.map((student) => student.sStudyProgramId).filter(Boolean)).size,
      currentTerm: selectedTerm
        ? {
            id: selectedTerm.id,
            termCode: selectedTerm.sTermCode,
            termName: selectedTerm.sTermName,
            academicYear: currentYear?.sYearCode || null,
            isSummer: selectedTerm.sIsSummer,
            previousMainTermId: selectedTermLinks?.previousMainTermId || null,
            nextMainTermId: selectedTermLinks?.nextMainTermId || null,
          }
        : null,
      summerContext: selectedTerm?.sIsSummer ? {
        isSummer: true,
        participantStudents: selectedTermParticipants.length,
        scopedStudents: scopedStudents.length,
        coverage: scopedStudents.length ? selectedTermParticipants.length / scopedStudents.length : 0,
        previousMainTermId: selectedTermLinks?.previousMainTermId || null,
        nextMainTermId: selectedTermLinks?.nextMainTermId || null,
        classification: "descriptive",
      } : null,
      counts: {
        red,
        yellow,
        green: liveWarningReport.counts.safe,
        evaluated: liveWarningReport.counts.evaluated,
        unassessed: liveWarningReport.counts.unassessed,
        conductApproved: conductValues.length,
        conductPending: conductRows.filter((row) => row.statusId === "0").length,
        conductMissing: Math.max(0, scopedStudents.length - conductRows.length),
      },
      topClasses: classes.map((item) => {
        const total = scopedStudents.filter((student) => student.sClassStudentId === item.classId).length;
        const warning = liveWarningReport.classBreakdown.find((row) => row.classCode === item.classId)?.warningStudents || 0;
        return {
          classId: item.classId,
          className: item.className,
          total,
          warning,
          rate: total ? Math.round((warning / total) * 100) : 0,
          faculty: selectedProgram?.s_faculty_code || "",
        };
      }).sort((a, b) => b.rate - a.rate).slice(0, 5),
      warningByClass: liveWarningReport.classBreakdown.map((item) => ({
        classId: item.classCode,
        className: item.className,
        red: item.high,
        yellow: item.medium,
      })),
      semesterTrend: [],
      updatedAt: sweResponse.generatedAt,
    };
  }
}
