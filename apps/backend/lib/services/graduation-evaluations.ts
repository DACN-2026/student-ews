import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { GradesService } from "@/lib/services/grades";

export const GRADUATION_STATUSES = [
  "EXPECTED_ELIGIBLE",
  "PENDING_GRADE",
  "PENDING_REQUIREMENT",
  "NOT_ELIGIBLE",
  "MANUAL_REVIEW",
] as const;

type GraduationStatus = (typeof GRADUATION_STATUSES)[number];
export type DetailResult = "PASS" | "FAIL" | "PENDING" | "NOT_AVAILABLE";

type EvaluationScope = {
  cohortId: string;
  trainingProgramId: string;
  assessmentAcademicTermId: string;
  specialization?: string | null;
  targetType?: string;
};

type DetailDraft = {
  ruleCode: string;
  ruleName: string;
  category: string;
  requiredValue: string | null;
  actualValue: string | null;
  result: DetailResult;
  reason: string | null;
  evidence: Prisma.InputJsonObject;
};

const SOURCE_MISSING_REASON = "Nguồn Apidog hiện chưa cung cấp dữ liệu đã xác minh cho điều kiện này.";

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requirementResult(value: string, failedValue: string): DetailResult {
  if (value === "PASSED" || value === "CLEAR" || value === "AVAILABLE") return "PASS";
  if (value === failedValue || value === "NOT_PASSED") return "FAIL";
  if (value === "PENDING") return "PENDING";
  return "NOT_AVAILABLE";
}

export function resolveGraduationStatus(details: Array<{ ruleCode: string; result: DetailResult }>): GraduationStatus {
  if (details.some((detail) => detail.result === "NOT_AVAILABLE")) return "MANUAL_REVIEW";
  if (details.some((detail) => detail.result === "FAIL")) return "NOT_ELIGIBLE";
  if (
    details.some(
      (detail) =>
        (detail.ruleCode === "PROGRAM_COMPLETION" ||
          detail.ruleCode === "20CT4201" ||
          detail.ruleCode === "20CT4202" ||
          detail.ruleCode === "TOTAL_CREDITS" ||
          detail.ruleCode === "COMPULSORY_CREDITS" ||
          detail.ruleCode === "ELECTIVE_CREDITS") &&
        detail.result === "PENDING",
    )
  ) {
    return "PENDING_GRADE";
  }
  if (details.some((detail) => detail.result === "PENDING")) return "PENDING_REQUIREMENT";
  return "EXPECTED_ELIGIBLE";
}

function resultReason(code: string, result: DetailResult, actual: string | null) {
  if (result === "PASS") return null;
  if (result === "NOT_AVAILABLE") return SOURCE_MISSING_REASON;
  if (code === "PROGRAM_COMPLETION" && result === "PENDING") {
    return `Còn ${actual || "học phần"} đang chờ kết quả chính thức.`;
  }
  if (result === "PENDING") return "Điều kiện đang chờ xác nhận hoặc bổ sung.";
  return "Giá trị hiện tại chưa đáp ứng điều kiện đã cấu hình.";
}

function normalizeTargetType(value?: string) {
  return ["active_students", "final_year", "overdue", "all_students"].includes(value || "")
    ? value!
    : "all_students";
}

export async function fetchDerivedRequirements(studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, {
    requirement: Prisma.StudentGraduationRequirementGetPayload<{}> | undefined;
    physicalStatus: string;
    defenseStatus: string;
    languageStatus: string;
    disciplineStatus: string;
    legalStatus: string;
    trainingStatus: string;
    conductScore: number | null;
    conductCount: number;
    isVerified: boolean;
  }>();

  const [requirements, conductGroups, studentRecords, suspensions, externalOfferings] = await Promise.all([
    prisma.studentGraduationRequirement.findMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentConductRecord.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds } },
      _avg: { lastScore: true },
      _count: { _all: true },
    }),
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, sIsInClass: true },
    }),
    prisma.studentDecision.findMany({
      where: {
        studentId: { in: studentIds },
        decisionTypeId: { in: [3, 4, 7] },
        deletedAt: null,
      },
      select: { studentId: true },
    }),
    prisma.studentCourseOffering.findMany({
      where: {
        studentId: { in: studentIds },
        OR: [
          { sCourseName: { contains: "thể chất", mode: "insensitive" } },
          { sCourseName: { contains: "quốc phòng", mode: "insensitive" } },
          { sCourseName: { contains: "tiếng anh", mode: "insensitive" } },
          { sCourseName: { contains: "ngoại ngữ", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        studentId: true,
        sCourseName: true,
      },
    }),
  ]);

  const offeringIds = externalOfferings.map((o) => o.id);
  const externalGrades = offeringIds.length
    ? await prisma.studentCourseGrade.findMany({
        where: { offeringId: { in: offeringIds } },
        select: { offeringId: true, isPass: true, scoreStatus: true },
      })
    : [];
  const gradeByOffering = new Map(externalGrades.map((g) => [g.offeringId, g]));

  const externalByStudent = new Map<string, Array<{ name: string; isPass: boolean; isPending: boolean }>>();
  for (const offering of externalOfferings) {
    const grade = gradeByOffering.get(offering.id);
    const isPending = grade?.scoreStatus === "pending";
    const isPass = Boolean(grade?.isPass && !isPending);
    const list = externalByStudent.get(offering.studentId) || [];
    list.push({ name: offering.sCourseName.toLowerCase(), isPass, isPending });
    externalByStudent.set(offering.studentId, list);
  }

  const requirementByStudent = new Map(requirements.map((item) => [item.studentId, item]));
  const conductByStudent = new Map(conductGroups.map((item) => [item.studentId, item]));
  const studentMap = new Map(studentRecords.map((item) => [item.id, item]));
  const suspendedSet = new Set(suspensions.map((item) => item.studentId));

  const result = new Map<string, {
    requirement: (typeof requirements)[number] | undefined;
    physicalStatus: string;
    defenseStatus: string;
    languageStatus: string;
    disciplineStatus: string;
    legalStatus: string;
    trainingStatus: string;
    conductScore: number | null;
    conductCount: number;
    isVerified: boolean;
  }>();

  for (const sId of studentIds) {
    const req = requirementByStudent.get(sId);
    const conduct = conductByStudent.get(sId);
    const studentRecord = studentMap.get(sId);
    const isSuspended = suspendedSet.has(sId) || (studentRecord && !studentRecord.sIsInClass);
    const extList = externalByStudent.get(sId) || [];

    let physicalStatus = req?.physicalEducationStatus;
    if (!physicalStatus || physicalStatus === "NOT_AVAILABLE") {
      const peList = extList.filter((e) => e.name.includes("thể chất"));
      const anyPending = peList.some((e) => e.isPending);
      const hasPassed = peList.some((e) => e.isPass);
      if (hasPassed && !anyPending) physicalStatus = "PASSED";
      else if (anyPending) physicalStatus = "PENDING";
      else if (peList.length > 0) physicalStatus = "NOT_PASSED";
      else physicalStatus = "NOT_AVAILABLE";
    }

    let defenseStatus = req?.nationalDefenseStatus;
    if (!defenseStatus || defenseStatus === "NOT_AVAILABLE") {
      const defList = extList.filter((e) => e.name.includes("quốc phòng"));
      const anyPending = defList.some((e) => e.isPending);
      const hasPassed = defList.some((e) => e.isPass);
      if (hasPassed && !anyPending) defenseStatus = "PASSED";
      else if (anyPending) defenseStatus = "PENDING";
      else if (defList.length > 0) defenseStatus = "NOT_PASSED";
      else defenseStatus = "NOT_AVAILABLE";
    }

    let languageStatus = req?.foreignLanguageStatus;
    if (!languageStatus || languageStatus === "NOT_AVAILABLE") {
      const langList = extList.filter((e) => e.name.includes("tiếng anh") || e.name.includes("ngoại ngữ"));
      const anyPending = langList.some((e) => e.isPending);
      const hasPassed = langList.some((e) => e.isPass);
      if (hasPassed && !anyPending) languageStatus = "PASSED";
      else if (anyPending) languageStatus = "PENDING";
      else if (langList.length > 0) languageStatus = "NOT_PASSED";
      else languageStatus = "NOT_AVAILABLE";
    }

    const disciplineStatus = req?.disciplineStatus && req.disciplineStatus !== "NOT_AVAILABLE"
      ? req.disciplineStatus
      : isSuspended ? "SUSPENDED" : "CLEAR";

    const legalStatus = req?.legalStatus && req.legalStatus !== "NOT_AVAILABLE"
      ? req.legalStatus
      : "CLEAR";

    const conductScore = req?.wholeCourseTrainingScore != null
      ? numberValue(req.wholeCourseTrainingScore)
      : conduct?._avg.lastScore != null
        ? numberValue(conduct._avg.lastScore)
        : null;
    const conductComplete = conductScore !== null;
    const trainingStatus = conductComplete ? "AVAILABLE" : "NOT_AVAILABLE";

    const isVerified =
      physicalStatus !== "NOT_AVAILABLE" &&
      defenseStatus !== "NOT_AVAILABLE" &&
      languageStatus !== "NOT_AVAILABLE" &&
      disciplineStatus !== "NOT_AVAILABLE" &&
      legalStatus !== "NOT_AVAILABLE";

    result.set(sId, {
      requirement: req,
      physicalStatus,
      defenseStatus,
      languageStatus,
      disciplineStatus,
      legalStatus,
      trainingStatus,
      conductScore,
      conductCount: conduct?._count._all || 0,
      isVerified,
    });
  }

  return result;
}

export class GraduationEvaluationsService {
  static async preview(scope: EvaluationScope) {
    const completionPreview = await TrainingProgressService.previewCompletionRun({
      cohortId: scope.cohortId,
      trainingProgramId: scope.trainingProgramId,
      assessmentAcademicTermId: scope.assessmentAcademicTermId,
      evaluationMode: "graduation_forecast",
    });
    if (!completionPreview.scope || !completionPreview.summary) {
      return {
        ...completionPreview,
        dataReadiness: null,
      };
    }

    const [program, classes] = await Promise.all([
      prisma.trainingProgram.findUnique({ where: { id: scope.trainingProgramId } }),
      prisma.class.findMany({
        where: { cohortId: scope.cohortId, deletedAt: null },
        select: { classId: true },
      }),
    ]);
    const targetType = normalizeTargetType(scope.targetType);
    const students = program
      ? await prisma.student.findMany({
          where: {
            deletedAt: null,
            sStudyProgramId: program.sProgramCode,
            sClassStudentId: { in: classes.map((item) => item.classId) },
            ...(targetType === "active_students" ? { sIsInClass: true } : {}),
          },
          select: { id: true },
        })
      : [];
    const studentIds = students.map((student) => student.id);
    const [derivedReqs, cumulativeStudents] = studentIds.length
      ? await Promise.all([
          fetchDerivedRequirements(studentIds),
          prisma.studentCumulativeSummary.findMany({
            where: { studentId: { in: studentIds }, sProgramCode: program?.sProgramCode || "" },
            select: { studentId: true, cumulativeGpa4: true },
          }),
        ])
      : [new Map(), []];

    const verified = [...derivedReqs.values()].filter((item) => item.isVerified).length;
    const conductAvailable = [...derivedReqs.values()].filter((item) => item.conductScore !== null).length;
    const gpaAvailable = cumulativeStudents.filter((item) => item.cumulativeGpa4 != null).length;

    const targetBlockers = [
      ...(targetType === "final_year" && !completionPreview.scope.programFinalReached
        ? [{ code: "FINAL_YEAR_NOT_REACHED", message: "Mốc đánh giá chưa đến kế hoạch cuối của CTĐT." }]
        : []),
      ...(targetType === "overdue"
        ? [{ code: "OVERDUE_RULE_NOT_CONFIGURED", message: "Chưa có quy tắc chính thức để xác định sinh viên quá hạn chuẩn." }]
        : []),
    ];
    return {
      ...completionPreview,
      valid: completionPreview.valid && targetBlockers.length === 0,
      canRun: completionPreview.canRun && targetBlockers.length === 0,
      dataReadiness: {
        studentCount: students.length,
        missingCurriculum: completionPreview.summary.coverageValid ? 0 : students.length,
        missingGpa: Math.max(0, students.length - gpaAvailable),
        missingWholeCourseTraining: Math.max(0, students.length - conductAvailable),
        missingVerifiedRequirements: Math.max(0, students.length - verified),
      },
      warnings: [
        ...completionPreview.warnings,
        ...(verified < students.length
          ? [{
              code: "GRADUATION_REQUIREMENTS_INCOMPLETE",
              message: "Thiếu dữ liệu xác minh GDTC, GDQP, ngoại ngữ, kỷ luật hoặc pháp lý cho một số sinh viên.",
              details: ["Sinh viên thiếu dữ liệu sẽ được phân loại Cần đối soát, không tự động coi là đạt."],
            }]
          : []),
      ],
      blockers: [...completionPreview.blockers, ...targetBlockers],
    };
  }

  static async createEvaluation(scope: EvaluationScope & { evaluatedBy?: string | null }) {
    const preview = await this.preview(scope);
    if (!preview.canRun || !preview.scope || !preview.summary) {
      throw new Error(preview.blockers?.[0]?.message || "Dữ liệu đầu vào chưa đủ để chạy đánh giá.");
    }

    const capturedAt = new Date();
    const completionRun = await TrainingProgressService.triggerCompletionRun({
      cohortId: scope.cohortId,
      trainingProgramId: scope.trainingProgramId,
      assessmentAcademicTermId: scope.assessmentAcademicTermId,
      evaluationMode: "graduation_forecast",
    });
    const rules = await prisma.graduationRule.findMany({
      where: {
        status: "active",
        OR: [
          { trainingProgramId: null, cohortId: null },
          { trainingProgramId: scope.trainingProgramId, cohortId: null },
          { trainingProgramId: scope.trainingProgramId, cohortId: scope.cohortId },
        ],
      },
      orderBy: [{ trainingProgramId: "asc" }, { cohortId: "asc" }, { ruleCode: "asc" }],
    });
    const ruleVersions = [...new Set(rules.map((rule) => rule.version))];
    const ruleVersion = ruleVersions.join("+") || "NO_ACTIVE_RULE";
    const snapshot = {
      scope: preview.scope,
      readiness: preview.dataReadiness,
      completionRunId: completionRun.id,
      completionSnapshotHash: completionRun.sourceSnapshotHash,
      rules: rules.map((rule) => ({
        code: rule.ruleCode,
        operator: rule.operator,
        requiredValue: rule.requiredValue,
        version: rule.version,
        sourceDocument: rule.sourceDocument,
      })),
      warnings: preview.warnings,
    };
    const snapshotHash = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const code = `GE-${capturedAt.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const evaluation = await prisma.graduationEvaluation.create({
      data: {
        evaluationCode: code,
        evaluationName: `Dự kiến tốt nghiệp ${preview.scope.cohortCode} / ${preview.scope.programCode}`,
        assessmentAcademicTermId: scope.assessmentAcademicTermId,
        cohortId: scope.cohortId,
        trainingProgramId: scope.trainingProgramId,
        specialization: scope.specialization?.trim() || null,
        targetType: normalizeTargetType(scope.targetType),
        completionRunId: completionRun.id,
        evaluatedBy: scope.evaluatedBy || null,
        ruleVersion,
        status: "running",
        sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        sourceSnapshotHash: snapshotHash,
        sourceCapturedAt: capturedAt,
      },
    });

    try {
      const allCompletionStudents = await prisma.trainingProgressCompletionStudentResult.findMany({
        where: { runId: completionRun.id },
        orderBy: { sStudentId: "asc" },
      });
      const activeStudentIds = normalizeTargetType(scope.targetType) === "active_students"
        ? new Set((await prisma.student.findMany({
            where: { id: { in: allCompletionStudents.map((item) => item.studentId) }, sIsInClass: true, deletedAt: null },
            select: { id: true },
          })).map((item) => item.id))
        : null;
      const completionStudents = activeStudentIds
        ? allCompletionStudents.filter((item) => activeStudentIds.has(item.studentId))
        : allCompletionStudents;
      const completionStudentIds = completionStudents.map((item) => item.id);
      const studentIds = completionStudents.map((item) => item.studentId);

      const [planResults, summaries, derivedReqs] = await Promise.all([
        prisma.trainingProgressCompletionPlanResult.findMany({
          where: { studentResultId: { in: completionStudentIds } },
        }),
        prisma.studentCumulativeSummary.findMany({
          where: { studentId: { in: studentIds }, sProgramCode: preview.scope.programCode },
        }),
        fetchDerivedRequirements(studentIds),
      ]);

      const planIds = planResults.map((item) => item.id);
      const courseResults = planIds.length
        ? await prisma.training_progress_completion_course_results.findMany({
            where: { plan_result_id: { in: planIds } },
          })
        : [];
      const summaryByStudent = new Map(summaries.map((item) => [item.studentId, item]));
      const planOwner = new Map(planResults.map((item) => [item.id, item.studentResultId]));
      const coursesByStudentResult = new Map<string, typeof courseResults>();
      for (const course of courseResults) {
        const studentResultId = planOwner.get(course.plan_result_id);
        if (!studentResultId) continue;
        const current = coursesByStudentResult.get(studentResultId) || [];
        current.push(course);
        coursesByStudentResult.set(studentResultId, current);
      }

      const studentRows: Prisma.GraduationEvaluationStudentCreateManyInput[] = [];
      const detailRows: Prisma.GraduationEvaluationDetailCreateManyInput[] = [];
      const counts: Record<GraduationStatus, number> = {
        EXPECTED_ELIGIBLE: 0,
        PENDING_GRADE: 0,
        PENDING_REQUIREMENT: 0,
        NOT_ELIGIBLE: 0,
        MANUAL_REVIEW: 0,
      };

      // Rule inheritance: Base -> Program -> Cohort
      const ruleByCode = new Map<string, (typeof rules)[number]>();
      for (const rule of rules.filter((r) => !r.trainingProgramId && !r.cohortId)) {
        ruleByCode.set(rule.ruleCode, rule);
      }
      for (const rule of rules.filter((r) => r.trainingProgramId === scope.trainingProgramId && !r.cohortId)) {
        ruleByCode.set(rule.ruleCode, rule);
      }
      for (const rule of rules.filter((r) => r.trainingProgramId === scope.trainingProgramId && r.cohortId === scope.cohortId)) {
        ruleByCode.set(rule.ruleCode, rule);
      }

      const gpaThreshold = numberValue(ruleByCode.get("CUMULATIVE_GPA")?.requiredValue) ?? 2;

      for (const student of completionStudents) {
        const summary = summaryByStudent.get(student.studentId);
        const derived = derivedReqs.get(student.studentId);
        const requirement = derived?.requirement;
        const courses = coursesByStudentResult.get(student.id) || [];
        const passedCourses = new Map<string, (typeof courses)[number]>();
        const pendingCourses = new Map<string, (typeof courses)[number]>();
        for (const course of courses) {
          if (course.passed && !course.pending_result) {
            passedCourses.set(course.course_id, course);
          } else if (course.pending_result) {
            pendingCourses.set(course.course_id, course);
          }
        }
        const compulsoryCredits = [...passedCourses.values()]
          .filter((course) => course.requirement_type === "mandatory")
          .reduce((sum, course) => sum + course.s_credits, 0);
        const pendingCompulsoryCredits = [...pendingCourses.values()]
          .filter((course) => course.requirement_type === "mandatory")
          .reduce((sum, course) => sum + course.s_credits, 0);
        const electiveCredits = [...passedCourses.values()]
          .filter((course) => course.requirement_type !== "mandatory")
          .reduce((sum, course) => sum + course.s_credits, 0);
        const pendingElectiveCredits = [...pendingCourses.values()]
          .filter((course) => course.requirement_type !== "mandatory")
          .reduce((sum, course) => sum + course.s_credits, 0);
        const gpa = numberValue(summary?.cumulativeGpa4 ?? student.cumulativeGpa4);
        const totalCredits = numberValue(summary?.cumulativeCredits);
        const pendingTotalCredits = [...pendingCourses.values()].reduce((sum, c) => sum + c.s_credits, 0);
        const curriculumResult: DetailResult = student.programCompletionStatus === "cannot_determine"
          ? "NOT_AVAILABLE"
          : student.programCompletionStatus === "completed"
            ? student.pendingResultCourses > 0 ? "PENDING" : "PASS"
            : "FAIL";

        // Check PE in course results if derived was not available
        let physicalStatus = derived?.physicalStatus || "NOT_AVAILABLE";
        if (physicalStatus === "NOT_AVAILABLE") {
          const peCourses = courses.filter((c) => c.s_course_name.toLowerCase().includes("thể chất") || c.s_course_code.toUpperCase().includes("TC"));
          if (peCourses.length > 0) {
            const anyPending = peCourses.some((c) => c.pending_result);
            const hasPassed = peCourses.every((c) => c.passed);
            physicalStatus = hasPassed && !anyPending ? "PASSED" : anyPending ? "PENDING" : "NOT_PASSED";
          }
        }

        // Check Defense in course results if derived was not available
        let defenseStatus = derived?.defenseStatus || "NOT_AVAILABLE";
        if (defenseStatus === "NOT_AVAILABLE") {
          const defCourses = courses.filter((c) => c.s_course_name.toLowerCase().includes("quốc phòng") || c.s_course_code.toUpperCase().startsWith("QP"));
          if (defCourses.length > 0) {
            const anyPending = defCourses.some((c) => c.pending_result);
            const hasPassed = defCourses.every((c) => c.passed);
            defenseStatus = hasPassed && !anyPending ? "PASSED" : anyPending ? "PENDING" : "NOT_PASSED";
          }
        }

        // Check Foreign language in course results if derived was not available
        let languageStatus = derived?.languageStatus || "NOT_AVAILABLE";
        if (languageStatus === "NOT_AVAILABLE") {
          const langCourses = courses.filter((c) => c.s_course_name.toLowerCase().includes("tiếng anh") || c.s_course_name.toLowerCase().includes("ngoại ngữ") || c.s_course_code.toUpperCase().startsWith("20CT2103") || c.s_course_code.toUpperCase().startsWith("20HN1104"));
          if (langCourses.length > 0) {
            const anyPending = langCourses.some((c) => c.pending_result);
            const hasPassed = langCourses.some((c) => c.passed);
            languageStatus = hasPassed && !anyPending ? "PASSED" : anyPending ? "PENDING" : "NOT_PASSED";
          }
        }

        const disciplineStatus = derived?.disciplineStatus || "CLEAR";
        const legalStatus = derived?.legalStatus || "CLEAR";
        const expectedConductTerms = Math.max(1, student.allPlansTotal);
        const conductScore = derived?.conductScore ?? null;
        const conductComplete = conductScore !== null;
        const trainingStatus = derived?.trainingStatus || (conductComplete ? "AVAILABLE" : "NOT_AVAILABLE");

        const isCurriculumDetermined = student.programCompletionStatus !== "cannot_determine" && Boolean(student.sProgramCode);

        const details: DetailDraft[] = [
          {
            ruleCode: "PROGRAM_MAPPING",
            ruleName: "Chương trình đào tạo áp dụng",
            category: "DATA",
            requiredValue: "Xác định đúng CTĐT áp dụng",
            actualValue: isCurriculumDetermined ? (student.sProgramCode || preview.scope.programCode) : null,
            result: isCurriculumDetermined ? "PASS" : "NOT_AVAILABLE",
            reason: isCurriculumDetermined ? null : "Không xác định được chương trình đào tạo áp dụng cho sinh viên.",
            evidence: { cohortId: scope.cohortId, trainingProgramId: scope.trainingProgramId, programCode: student.sProgramCode },
          },
          {
            ruleCode: "PROGRAM_COMPLETION",
            ruleName: "Hoàn thành cấu trúc chương trình đào tạo",
            category: "CURRICULUM",
            requiredValue: "Đạt toàn bộ kế hoạch CTĐT đã khóa",
            actualValue: curriculumResult === "PASS" ? "Đã hoàn thành" : curriculumResult === "PENDING" ? `${student.pendingResultCourses} học phần chờ điểm` : `${student.missingMandatoryCourses} học phần bắt buộc và ${student.missingElectiveCredits} TC tự chọn còn thiếu`,
            result: curriculumResult,
            reason: resultReason("PROGRAM_COMPLETION", curriculumResult, String(student.pendingResultCourses)),
            evidence: { completionRunId: completionRun.id, completionStudentResultId: student.id },
          },
          {
            ruleCode: "CUMULATIVE_GPA",
            ruleName: "Điểm trung bình tích lũy hệ 4",
            category: "ACADEMIC",
            requiredValue: `>= ${gpaThreshold.toFixed(2)}`,
            actualValue: gpa == null ? null : gpa.toFixed(2),
            result: gpa == null ? "NOT_AVAILABLE" : gpa >= gpaThreshold ? "PASS" : "FAIL",
            reason: gpa == null ? "Chưa có GPA tích lũy từ nguồn điểm." : gpa >= gpaThreshold ? null : `GPA ${gpa.toFixed(2)} thấp hơn ngưỡng ${gpaThreshold.toFixed(2)}.`,
            evidence: { source: "student_cumulative_summaries" },
          },
          ...[
            ...(ruleByCode.has("PHYSICAL_EDUCATION") ? [["PHYSICAL_EDUCATION", "Chứng chỉ Giáo dục thể chất", physicalStatus, "NOT_PASSED"]] : []),
            ...(ruleByCode.has("NATIONAL_DEFENSE") ? [["NATIONAL_DEFENSE", "Chứng chỉ Giáo dục quốc phòng và an ninh", defenseStatus, "NOT_PASSED"]] : []),
            ...(ruleByCode.has("FOREIGN_LANGUAGE") ? [["FOREIGN_LANGUAGE", "Chuẩn đầu ra ngoại ngữ", languageStatus, "NOT_PASSED"]] : []),
            ["DISCIPLINE", "Không trong thời gian đình chỉ học tập", disciplineStatus, "SUSPENDED"],
            ["LEGAL", "Không bị truy cứu trách nhiệm hình sự", legalStatus, "UNDER_CRIMINAL_PROCEEDING"],
          ].map(([ruleCode, ruleName, value, failedValue]) => {
            const result = requirementResult(value, failedValue);
            return {
              ruleCode,
              ruleName,
              category: ruleCode === "PHYSICAL_EDUCATION" || ruleCode === "NATIONAL_DEFENSE" ? "CERTIFICATE" : ruleCode === "FOREIGN_LANGUAGE" ? "OUTCOME" : "STATUS",
              requiredValue: ruleCode === "DISCIPLINE" || ruleCode === "LEGAL" ? "CLEAR" : "PASSED",
              actualValue: value,
              result,
              reason: resultReason(ruleCode, result, value),
              evidence: { source: requirement?.sourceSystem || "academic_records", verifiedAt: requirement?.verifiedAt?.toISOString() || null } as Prisma.InputJsonObject,
            } satisfies DetailDraft;
          }),
          {
            ruleCode: "WHOLE_COURSE_TRAINING",
            ruleName: "Kết quả rèn luyện toàn khóa",
            category: "TRAINING",
            requiredValue: "Có dữ liệu toàn khóa, không áp ngưỡng đậu rớt",
            actualValue: conductScore == null ? null : conductScore.toFixed(2),
            result: conductComplete ? "PASS" : "NOT_AVAILABLE",
            reason: conductComplete ? null : `Mới có ${derived?.conductCount || 0}/${expectedConductTerms} kỳ rèn luyện dự kiến.`,
            evidence: { source: requirement?.wholeCourseTrainingScore != null ? "student_graduation_requirements" : "student_conduct_records", termCount: derived?.conductCount || 0 },
          },
        ];

        for (const creditRule of [
          { code: "TOTAL_CREDITS", name: "Tổng tín chỉ tích lũy", actual: totalCredits, pending: pendingTotalCredits },
          { code: "COMPULSORY_CREDITS", name: "Tín chỉ bắt buộc", actual: compulsoryCredits, pending: pendingCompulsoryCredits },
          { code: "ELECTIVE_CREDITS", name: "Tín chỉ tự chọn", actual: electiveCredits, pending: pendingElectiveCredits },
        ]) {
          const rule = ruleByCode.get(creditRule.code);
          if (!rule) continue;
          const required = numberValue(rule.requiredValue);
          let result: DetailResult = "NOT_AVAILABLE";
          let reason: string | null = null;
          if (creditRule.actual == null || required == null) {
            result = "NOT_AVAILABLE";
            reason = "Chưa có dữ liệu tín chỉ đủ tin cậy.";
          } else if (creditRule.actual >= required) {
            result = "PASS";
            reason = null;
          } else if (creditRule.actual + creditRule.pending >= required) {
            result = "PENDING";
            reason = `Đang chờ điểm ${creditRule.pending} tín chỉ.`;
          } else {
            result = "FAIL";
            reason = `Còn thiếu ${Math.max(0, Number(required) - Number(creditRule.actual + creditRule.pending))} tín chỉ ngay cả khi đạt toàn bộ học phần đang chờ điểm.`;
          }
          details.push({
            ruleCode: creditRule.code,
            ruleName: creditRule.name,
            category: "CREDIT",
            requiredValue: required == null ? rule.requiredValue : `>= ${required}`,
            actualValue: creditRule.actual == null ? null : String(creditRule.actual),
            result,
            reason,
            evidence: { source: creditRule.code === "TOTAL_CREDITS" ? "student_cumulative_summaries" : "completion_course_results" },
          });
        }

        const internshipCourse = courses.find((item) =>
          item.s_course_code?.startsWith("20CT4201") ||
          item.s_course_name?.toLowerCase().includes("thực tập nghề nghiệp")
        );
        if (internshipCourse) {
          const result: DetailResult = internshipCourse.pending_result ? "PENDING" : internshipCourse.passed ? "PASS" : "FAIL";
          details.push({
            ruleCode: "20CT4201",
            ruleName: "Thực tập nghề nghiệp",
            category: "CURRICULUM",
            requiredValue: "PASSED",
            actualValue: internshipCourse.pending_result ? "PENDING" : internshipCourse.passed ? "PASSED" : "NOT_PASSED",
            result,
            reason: resultReason("20CT4201", result, internshipCourse.s_course_code),
            evidence: { courseId: internshipCourse.course_id, courseCode: internshipCourse.s_course_code },
          });
        }

        const thesisCourse = courses.find((item) =>
          item.s_course_code?.startsWith("20CT4202") ||
          item.s_course_name?.toLowerCase().includes("đồ án tốt nghiệp")
        );
        if (thesisCourse) {
          const result: DetailResult = thesisCourse.pending_result ? "PENDING" : thesisCourse.passed ? "PASS" : "FAIL";
          details.push({
            ruleCode: "20CT4202",
            ruleName: "Đồ án tốt nghiệp",
            category: "CURRICULUM",
            requiredValue: "PASSED",
            actualValue: thesisCourse.pending_result ? "PENDING" : thesisCourse.passed ? "PASSED" : "NOT_PASSED",
            result,
            reason: resultReason("20CT4202", result, thesisCourse.s_course_code),
            evidence: { courseId: thesisCourse.course_id, courseCode: thesisCourse.s_course_code },
          });
        }

        const status = resolveGraduationStatus(details);
        counts[status]++;
        const reasons = details
          .filter((detail) => detail.result !== "PASS")
          .map((detail) => ({ code: detail.ruleCode, result: detail.result, message: detail.reason || detail.ruleName }));
        const evaluationStudentId = crypto.randomUUID();
        studentRows.push({
          id: evaluationStudentId,
          evaluationId: evaluation.id,
          studentId: student.studentId,
          classId: student.classId,
          cohortId: student.cohortId,
          sStudentId: student.sStudentId,
          sStudentName: student.sStudentName,
          sClassName: student.sClassName,
          sProgramCode: student.sProgramCode,
          totalCredits,
          compulsoryCredits,
          electiveCredits,
          cumulativeGpa4: gpa,
          curriculumStatus: curriculumResult === "PASS" ? "PASSED" : curriculumResult === "PENDING" ? "PENDING" : curriculumResult === "FAIL" ? "NOT_PASSED" : "NOT_AVAILABLE",
          physicalEducationStatus: physicalStatus,
          nationalDefenseStatus: defenseStatus,
          foreignLanguageStatus: languageStatus,
          trainingStatus,
          disciplineStatus,
          legalStatus,
          wholeCourseTrainingScore: conductScore,
          missingRequiredCourses: student.missingMandatoryCourses,
          missingElectiveCredits: student.missingElectiveCredits,
          pendingResultCourses: student.pendingResultCourses,
          finalStatus: status,
          reasons: reasons as unknown as Prisma.InputJsonValue,
        });
        for (const detail of details) {
          detailRows.push({
            id: crypto.randomUUID(),
            evaluationStudentId,
            ...detail,
            evidence: detail.evidence,
          });
        }
      }

      return await prisma.$transaction(async (tx) => {
        if (studentRows.length) await tx.graduationEvaluationStudent.createMany({ data: studentRows });
        if (detailRows.length) await tx.graduationEvaluationDetail.createMany({ data: detailRows });
        return tx.graduationEvaluation.update({
          where: { id: evaluation.id },
          data: {
            status: "completed",
            totalStudents: completionStudents.length,
            expectedEligibleStudents: counts.EXPECTED_ELIGIBLE,
            pendingGradeStudents: counts.PENDING_GRADE,
            pendingRequirementStudents: counts.PENDING_REQUIREMENT,
            notEligibleStudents: counts.NOT_ELIGIBLE,
            manualReviewStudents: counts.MANUAL_REVIEW,
            evaluatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await prisma.graduationEvaluation.update({
        where: { id: evaluation.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Graduation evaluation failed",
          evaluatedAt: new Date(),
        },
      });
      throw error;
    }
  }

  static async listEvaluations(
    filters: { cohortId?: string; trainingProgramId?: string; termId?: string; status?: string },
    page: number,
    pageSize: number,
    scopeWhere: Prisma.GraduationEvaluationWhereInput = {},
  ) {
    const where: Prisma.GraduationEvaluationWhereInput = {
      AND: [
        scopeWhere,
        filters.cohortId ? { cohortId: filters.cohortId } : {},
        filters.trainingProgramId ? { trainingProgramId: filters.trainingProgramId } : {},
        filters.termId ? { assessmentAcademicTermId: filters.termId } : {},
        filters.status ? { status: filters.status } : {},
      ],
    };
    const [total, evaluations] = await Promise.all([
      prisma.graduationEvaluation.count({ where }),
      prisma.graduationEvaluation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const [cohorts, programs, terms] = await Promise.all([
      prisma.cohort.findMany({ where: { id: { in: evaluations.map((item) => item.cohortId) } } }),
      prisma.trainingProgram.findMany({ where: { id: { in: evaluations.map((item) => item.trainingProgramId) } } }),
      prisma.academicTerm.findMany({ where: { id: { in: evaluations.map((item) => item.assessmentAcademicTermId) } } }),
    ]);
    const years = await prisma.academicYear.findMany({
      where: { id: { in: terms.map((term) => term.academicYearId) } },
    });
    const cohortMap = new Map(cohorts.map((item) => [item.id, item]));
    const programMap = new Map(programs.map((item) => [item.id, item]));
    const termMap = new Map(terms.map((item) => [item.id, item]));
    const yearMap = new Map(years.map((item) => [item.id, item]));
    return {
      items: evaluations.map((item) => {
        const term = termMap.get(item.assessmentAcademicTermId);
        return {
          ...item,
          cohortCode: cohortMap.get(item.cohortId)?.sCohortCode || null,
          cohortName: cohortMap.get(item.cohortId)?.sCohortName || null,
          programCode: programMap.get(item.trainingProgramId)?.sProgramCode || null,
          programName: programMap.get(item.trainingProgramId)?.sProgramName || null,
          assessmentTermCode: term?.sTermCode || null,
          assessmentTermName: term?.sTermName || null,
          assessmentAcademicYear: term ? yearMap.get(term.academicYearId)?.sYearCode || null : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  static async getEvaluation(id: string) {
    const result = await this.listEvaluations({}, 1, 1, { id });
    return result.items[0] || null;
  }

  static async listStudents(
    evaluationId: string,
    filters: { status?: string; keyword?: string; classId?: string },
    page: number,
    pageSize: number,
    allowedClassIds?: string[] | null,
  ) {
    const classScope = filters.classId
      ? allowedClassIds && !allowedClassIds.includes(filters.classId) ? { in: [] as string[] } : filters.classId
      : allowedClassIds !== undefined && allowedClassIds !== null ? { in: allowedClassIds } : undefined;
    const where: Prisma.GraduationEvaluationStudentWhereInput = {
      evaluationId,
      ...(filters.status ? { finalStatus: filters.status } : {}),
      ...(filters.keyword ? {
        OR: [
          { sStudentId: { contains: filters.keyword, mode: "insensitive" } },
          { sStudentName: { contains: filters.keyword, mode: "insensitive" } },
        ],
      } : {}),
      ...(classScope !== undefined ? { classId: classScope } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.graduationEvaluationStudent.count({ where }),
      prisma.graduationEvaluationStudent.findMany({
        where,
        orderBy: { sStudentId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        totalCredits: numberValue(item.totalCredits),
        compulsoryCredits: numberValue(item.compulsoryCredits),
        electiveCredits: numberValue(item.electiveCredits),
        cumulativeGpa4: numberValue(item.cumulativeGpa4),
        wholeCourseTrainingScore: numberValue(item.wholeCourseTrainingScore),
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getStudent(evaluationId: string, studentIdentifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentIdentifier);
    const evaluation = await prisma.graduationEvaluation.findUnique({ where: { id: evaluationId } });
    if (!evaluation) return null;
    const student = await prisma.graduationEvaluationStudent.findFirst({
      where: {
        evaluationId,
        OR: [
          { sStudentId: studentIdentifier },
          ...(isUuid ? [{ studentId: studentIdentifier }] : []),
        ],
      },
    });
    if (!student) return null;
    const [details, completionDetail, grades] = await Promise.all([
      prisma.graduationEvaluationDetail.findMany({
        where: { evaluationStudentId: student.id },
        orderBy: [{ category: "asc" }, { ruleCode: "asc" }],
      }),
      evaluation.completionRunId
        ? TrainingProgressService.getCompletionStudentDetail(evaluation.completionRunId, student.studentId)
        : null,
      GradesService.list(student.studentId),
    ]);

    const gradeByCourseCode = new Map<string, (typeof grades)[number]>();
    for (const g of grades) {
      if (g.courseCode) gradeByCourseCode.set(g.courseCode.toUpperCase(), g);
    }

    const uniqueByCourseCode = <T extends { courseCode?: string | null }>(list: T[]): T[] => {
      const seen = new Set<string>();
      return list.filter((item) => {
        const code = item.courseCode?.toUpperCase();
        if (!code || seen.has(code)) return false;
        seen.add(code);
        return true;
      });
    };

    const allCourses = completionDetail?.plans.flatMap((plan) => plan.courses.map((course) => {
      const g = course.courseCode ? gradeByCourseCode.get(course.courseCode.toUpperCase()) : null;
      return {
        ...course,
        curriculumSemesterNo: plan.curriculumSemesterNo,
        gradeInfo: g ? {
          score10: g.score10,
          score4: g.score4,
          letterGrade: g.letterGrade,
          scoreStatus: g.scoreStatus,
          isPassed: g.isPassed,
          notScore: g.notScore,
          academicYear: g.academicYear,
          termCode: g.termCode,
        } : null,
      };
    })) || [];

    const electiveRule = details.find((d) => d.ruleCode === "ELECTIVE_CREDITS");
    const requiredElectiveCredits = electiveRule && electiveRule.requiredValue
      ? Number(String(electiveRule.requiredValue).replace(/[^0-9.]/g, "")) || 46
      : 46;

    const compulsoryRule = details.find((d) => d.ruleCode === "COMPULSORY_CREDITS");
    const requiredCompulsoryCredits = compulsoryRule && compulsoryRule.requiredValue
      ? Number(String(compulsoryRule.requiredValue).replace(/[^0-9.]/g, "")) || 104
      : 104;

    const studentElectiveCredits = numberValue(student.electiveCredits) ?? 0;
    const studentCompulsoryCredits = numberValue(student.compulsoryCredits) ?? 0;

    const isElectiveSatisfied = studentElectiveCredits >= requiredElectiveCredits;
    const missingElectiveCredits = Math.max(0, requiredElectiveCredits - studentElectiveCredits);
    const excessElectiveCredits = Math.max(0, studentElectiveCredits - requiredElectiveCredits);

    // Filter pending courses (e.g. Practicum, Graduation Thesis, or current semester courses)
    const pendingCourses = uniqueByCourseCode(allCourses.filter((c) => c.pendingResult));

    // Mandatory courses analysis
    const mandatoryCourses = allCourses.filter((c) => c.requirementType === "mandatory");
    const unpassedMandatory = uniqueByCourseCode(mandatoryCourses.filter((c) => !c.passed && !c.pendingResult));
    const failedMandatory = unpassedMandatory.filter(
      (c) => Boolean(c.gradeInfo) && (c.gradeInfo?.isPassed === false || c.gradeInfo?.letterGrade === "F"),
    );
    const unregisteredMandatory = unpassedMandatory.filter(
      (c) => !c.gradeInfo || (c.gradeInfo?.isPassed !== false && c.gradeInfo?.letterGrade !== "F"),
    );

    // Elective courses analysis
    const electiveCourses = allCourses.filter((c) => c.requirementType !== "mandatory");
    const unpassedElectives = uniqueByCourseCode(electiveCourses.filter((c) => !c.passed && !c.pendingResult));
    const failedElectives = unpassedElectives.filter(
      (c) => Boolean(c.gradeInfo) && (c.gradeInfo?.isPassed === false || c.gradeInfo?.letterGrade === "F"),
    );
    const unchosenElectives = unpassedElectives.filter(
      (c) => !c.gradeInfo || (c.gradeInfo?.isPassed !== false && c.gradeInfo?.letterGrade !== "F"),
    );

    const electiveGroups = completionDetail?.plans.flatMap((plan) =>
      Array.isArray(plan.choiceGroupResults)
        ? (plan.choiceGroupResults as Array<Record<string, unknown>>).map((group) => ({
            ...group,
            curriculumSemesterNo: plan.curriculumSemesterNo,
          }))
        : [],
    ) || [];

    // For backwards compatibility: missingCourses should only contain mandatory missing courses
    // plus elective options ONLY IF student has an elective credit deficit.
    const missingCourses = isElectiveSatisfied
      ? unpassedMandatory
      : [...unpassedMandatory, ...unchosenElectives];

    return {
      evaluation: {
        id: evaluation.id,
        evaluationCode: evaluation.evaluationCode,
        ruleVersion: evaluation.ruleVersion,
        sourceCapturedAt: evaluation.sourceCapturedAt,
      },
      student: {
        ...student,
        totalCredits: numberValue(student.totalCredits),
        compulsoryCredits: studentCompulsoryCredits,
        electiveCredits: studentElectiveCredits,
        cumulativeGpa4: numberValue(student.cumulativeGpa4),
        wholeCourseTrainingScore: numberValue(student.wholeCourseTrainingScore),
      },
      requirements: details,
      missingCourses,
      pendingCourses,
      missingMandatoryCourses: unpassedMandatory,
      mandatoryAnalysis: {
        requiredCredits: requiredCompulsoryCredits,
        accumulatedCredits: studentCompulsoryCredits,
        isSatisfied: studentCompulsoryCredits >= requiredCompulsoryCredits,
        failedCourses: failedMandatory,
        unregisteredCourses: unregisteredMandatory,
        pendingCourses: pendingCourses.filter((c) => c.requirementType === "mandatory"),
      },
      electiveAnalysis: {
        requiredCredits: requiredElectiveCredits,
        accumulatedCredits: studentElectiveCredits,
        missingCredits: missingElectiveCredits,
        excessCredits: excessElectiveCredits,
        isSatisfied: isElectiveSatisfied,
        failedCourses: failedElectives,
        availableOptions: unchosenElectives,
        groups: electiveGroups,
      },
      electiveGroups,
      grades,
    };
  }
}
