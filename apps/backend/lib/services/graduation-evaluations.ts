import { orderedStudentResultPage } from "../student-list-order";
import { monitoredStudentResultWhere, monitoredStudentWhere } from "../student-monitoring-scope";
import { loadProgramCurriculum } from "./program-curriculum";
import { k44ElectiveAlternatives } from "../k44-elective-blocks";
import { assessCertificateRequirements, isConditionalCourse, isK44StandardProgram, sourcePassOutcome } from "../academic-course-rules";
import { loadSourceCreditRecognitions, type SourceCreditRecognition } from "./source-credit-recognition";
import crypto from "node:crypto";
import type { GraduationRule, Prisma, StudentGraduationRequirement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runClassScopes } from "@/lib/auth/data-scope";
import type { Actor } from "@/lib/auth/types";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { GradesService } from "@/lib/services/grades";
import { graduationReasonsWithoutConduct, graduationSnapshotWithoutConduct, isGraduationCriterionEnabled, omitGraduationConduct } from "./graduation-criteria";
import { buildGraduationForecast, type ForecastCourse, type ForecastGrade, type ForecastSchedule } from "@/lib/services/graduation-forecast";

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

const SOURCE_MISSING_REASON = "Chưa có dữ liệu đã được xác minh cho điều kiện này.";

const REQUIRED_RULE_CODES = [
  "PROGRAM_COMPLETION",
  "CUMULATIVE_GPA",
  "TOTAL_CREDITS",
  "COMPULSORY_CREDITS",
  "ELECTIVE_CREDITS",
  "PHYSICAL_EDUCATION",
  "NATIONAL_DEFENSE",
] as const;

type GraduationRuleRow = GraduationRule;

type AssessmentCutoff = {
  termIds: string[];
  termById: Map<string, { sTermCode: string; sTermOrder: number; academicYearId: string; sIsSummer: boolean; isCurrent: boolean }>;
  yearById: Map<string, { sYearCode: string }>;
};

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requirementResult(value: string, failedValue: string): DetailResult {
  if (value === "PASSED" || value === "CLEAR" || value === "AVAILABLE") return "PASS";
  if (value === failedValue || value === "NOT_PASSED") return "FAIL";
  if (value === "PENDING" || value === "PENDING_CONFIRMATION") return "PENDING";
  return "NOT_AVAILABLE";
}

export function resolveGraduationStatus(
  details: Array<{ ruleCode: string; result: DetailResult }>,
): GraduationStatus {
  details = details.filter(detail => isGraduationCriterionEnabled(detail.ruleCode));
  if (details.some((detail) => detail.result === "FAIL")) return "NOT_ELIGIBLE";
  if (details.some((detail) => detail.result === "NOT_AVAILABLE")) return "MANUAL_REVIEW";
  if (
    details.some(
      (detail) =>
        (detail.ruleCode === "PROGRAM_COMPLETION" ||
          detail.ruleCode === "CUMULATIVE_GPA" ||
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
  if (result === "NOT_AVAILABLE") {
    switch (code) {
      case "PHYSICAL_EDUCATION":
        return "Chưa có dữ liệu chứng chỉ Giáo dục thể chất.";
      case "NATIONAL_DEFENSE":
        return "Chưa có dữ liệu chứng chỉ Giáo dục quốc phòng và an ninh.";
      case "CUMULATIVE_GPA":
        return "Chưa có GPA tích lũy tại mốc đánh giá.";
      case "PROGRAM_COMPLETION":
        return "Chưa đủ quy tắc hoặc dữ liệu CTĐT để kết luận hoàn thành.";
      default:
        return SOURCE_MISSING_REASON;
    }
  }
  if (code === "PROGRAM_COMPLETION" && result === "PENDING") {
    return `Còn ${actual || "học phần"} đang chờ kết quả chính thức.`;
  }
  if (result === "PENDING" && ["PHYSICAL_EDUCATION", "NATIONAL_DEFENSE"].includes(code)) return actual === "PENDING_CONFIRMATION"
    ? "Chưa ghi nhận hoàn thành hoặc công nhận/miễn điều kiện này tại mốc xét; chờ xác nhận, không tự coi là đạt."
    : "Đang chờ kết quả các học phần điều kiện theo API Trường.";
  if (result === "PENDING") return "Điều kiện đang chờ xác nhận hoặc bổ sung.";
  return "Giá trị hiện tại chưa đáp ứng điều kiện đã cấu hình.";
}

function normalizeTargetType(value?: string) {
  return ["active_students", "final_year", "overdue", "all_students"].includes(value || "")
    ? value!
    : "all_students";
}

function academicYearStart(code: string) {
  const value = Number.parseInt(code.match(/\d{4}/)?.[0] || "", 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

async function loadAssessmentCutoff(assessmentAcademicTermId: string): Promise<AssessmentCutoff> {
  const [selectedTerm, terms, years] = await Promise.all([
    prisma.academicTerm.findUnique({ where: { id: assessmentAcademicTermId } }),
    prisma.academicTerm.findMany({
      where: { deletedAt: null },
      select: { id: true, academicYearId: true, sTermCode: true, sTermOrder: true, sIsSummer: true, isCurrent: true },
    }),
    prisma.academicYear.findMany({
      where: { deletedAt: null },
      select: { id: true, sYearCode: true },
    }),
  ]);
  if (!selectedTerm) throw new Error("Không tìm thấy học kỳ đánh giá.");
  const yearById = new Map(years.map((year) => [year.id, year]));
  const selectedYear = yearById.get(selectedTerm.academicYearId);
  if (!selectedYear) throw new Error("Không tìm thấy năm học của học kỳ đánh giá.");
  const selectedYearStart = academicYearStart(selectedYear.sYearCode);
  const includedTerms = terms.filter((term) => {
    const year = yearById.get(term.academicYearId);
    if (!year) return false;
    const yearStart = academicYearStart(year.sYearCode);
    return yearStart < selectedYearStart ||
      (yearStart === selectedYearStart && term.sTermOrder <= selectedTerm.sTermOrder);
  });
  return {
    termIds: includedTerms.map((term) => term.id),
    termById: new Map(includedTerms.map((term) => [term.id, term])),
    yearById,
  };
}

function ruleSpecificity(rule: GraduationRuleRow, scope: EvaluationScope) {
  if (rule.trainingProgramId === scope.trainingProgramId && rule.cohortId === scope.cohortId) return 2;
  if (rule.trainingProgramId === scope.trainingProgramId && !rule.cohortId) return 1;
  if (!rule.trainingProgramId && !rule.cohortId) return 0;
  return -1;
}

export function isApplicableGraduationRule(rule: Pick<GraduationRuleRow, "ruleCode" | "trainingProgramId" | "cohortId">, scope: Pick<EvaluationScope, "trainingProgramId" | "cohortId">) {
  if (!isGraduationCriterionEnabled(rule.ruleCode)) return false;
  if (PROGRAM_SCOPED_RULES.has(rule.ruleCode)) return rule.trainingProgramId === scope.trainingProgramId &&
    (!rule.cohortId || rule.cohortId === scope.cohortId);
  return (!rule.trainingProgramId || rule.trainingProgramId === scope.trainingProgramId) &&
    (!rule.cohortId || rule.cohortId === scope.cohortId);
}

async function loadResolvedRules(scope: EvaluationScope) {
  const rules = await prisma.graduationRule.findMany({
    where: {
      status: "active",
      OR: [
        { trainingProgramId: null, cohortId: null },
        { trainingProgramId: scope.trainingProgramId, cohortId: null },
        { trainingProgramId: scope.trainingProgramId, cohortId: scope.cohortId },
      ],
    },
    orderBy: [{ ruleCode: "asc" }, { updatedAt: "desc" }],
  });
  const candidates = new Map<string, GraduationRuleRow[]>();
  for (const rule of rules) {
    if (!isApplicableGraduationRule(rule, scope)) continue;
    const list = candidates.get(rule.ruleCode) || [];
    list.push(rule);
    candidates.set(rule.ruleCode, list);
  }
  const resolved = new Map<string, GraduationRuleRow>();
  const conflicts: string[] = [];
  for (const [code, codeRules] of candidates) {
    const maxSpecificity = Math.max(...codeRules.map((rule) => ruleSpecificity(rule, scope)));
    const winners = codeRules.filter((rule) => ruleSpecificity(rule, scope) === maxSpecificity);
    if (winners.length > 1) conflicts.push(code);
    // A numeric graduation threshold belongs to a particular curriculum. A global
    // K44 seed rule must never become the threshold for CQ22–CQ25 by fallback.
    if (winners.length === 1) resolved.set(code, winners[0]);
  }
  const missing = REQUIRED_RULE_CODES.filter((code) => !resolved.has(code));
  const invalid = ["CUMULATIVE_GPA", "TOTAL_CREDITS", "COMPULSORY_CREDITS", "ELECTIVE_CREDITS"]
    .filter((code) => resolved.has(code) && numberValue(resolved.get(code)?.requiredValue) === null);
  return { rules: [...resolved.values()], ruleByCode: resolved, missing, conflicts, invalid };
}

const PROGRAM_SCOPED_RULES = new Set(["TOTAL_CREDITS", "COMPULSORY_CREDITS", "ELECTIVE_CREDITS", "CUMULATIVE_GPA"]);

export function isExcludedFromGraduationCredits(courseCode: string | null | undefined, courseName: string | null | undefined) {
  return isConditionalCourse(courseCode, courseName);
}

export async function fetchDerivedRequirements(studentIds: string[], allowedTermIds: string[], recognition?: Map<string, SourceCreditRecognition>) {
  if (studentIds.length === 0) return new Map<string, {
    requirement: StudentGraduationRequirement | undefined;
    physicalStatus: string;
    defenseStatus: string;
    languageStatus: string;
    disciplineStatus: string;
    legalStatus: string;
    isVerified: boolean;
    certificates: ReturnType<typeof assessCertificateRequirements>;
  }>();

  const [requirements, offerings] = await Promise.all([
    prisma.studentGraduationRequirement.findMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentCourseOffering.findMany({
      where: { studentId: { in: studentIds }, academicTermId: { in: allowedTermIds } },
      select: { studentId: true, sCurriculumId: true, sCourseName: true, sCredits: true, id: true },
    }),
  ]);

  const grades = offerings.length ? await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map((item) => item.id) } } }) : [];
  const gradeByOffering = new Map(grades.map((item) => [item.offeringId, item]));
  const requirementByStudent = new Map(requirements.map((item) => [item.studentId, item]));

  const result = new Map<string, {
    requirement: (typeof requirements)[number] | undefined;
    physicalStatus: string;
    defenseStatus: string;
    languageStatus: string;
    disciplineStatus: string;
    legalStatus: string;
    isVerified: boolean;
    certificates: ReturnType<typeof assessCertificateRequirements>;
  }>();

  for (const sId of studentIds) {
    const req = requirementByStudent.get(sId);
    const certificateAttempts = offerings.filter((item) => item.studentId === sId).map((item) => ({
      courseCode: item.sCurriculumId, courseName: item.sCourseName, credits: item.sCredits,
      isPass: gradeByOffering.get(item.id)?.sourcePayload === undefined ? gradeByOffering.get(item.id)?.isPass : sourcePassOutcome(gradeByOffering.get(item.id)?.sourcePayload), scoreStatus: gradeByOffering.get(item.id)?.scoreStatus, notScore: gradeByOffering.get(item.id)?.notScore,
      score10: numberValue(gradeByOffering.get(item.id)?.score10), score4: numberValue(gradeByOffering.get(item.id)?.score4),
      letterCode: gradeByOffering.get(item.id)?.letterCode, specialCode: gradeByOffering.get(item.id)?.specialCode,
    }));
    const certificates = assessCertificateRequirements([...certificateAttempts, ...(recognition?.get(sId)?.attempts ?? [])]);
    // Retain independently verified recognition. Otherwise derive the existing
    // certificate fields from results at this evaluation's cutoff.
    const physicalStatus = req?.physicalEducationStatus === "PASSED" ? "PASSED" : certificates.physical.status === "NOT_AVAILABLE" ? "PENDING_CONFIRMATION" : certificates.physical.status;
    const defenseStatus = req?.nationalDefenseStatus === "PASSED" ? "PASSED" : certificates.defense.status === "NOT_AVAILABLE" ? "PENDING_CONFIRMATION" : certificates.defense.status;
    const languageStatus = req?.foreignLanguageStatus || "NOT_AVAILABLE";
    const disciplineStatus = req?.disciplineStatus || "NOT_AVAILABLE";
    const legalStatus = req?.legalStatus || "NOT_AVAILABLE";

    const isVerified =
      physicalStatus !== "PENDING_CONFIRMATION" &&
      defenseStatus !== "PENDING_CONFIRMATION";

    result.set(sId, {
      requirement: req,
      physicalStatus,
      defenseStatus,
      languageStatus,
      disciplineStatus,
      legalStatus,
      isVerified,
      certificates,
    });
  }

  return result;
}

async function fetchGradeSnapshots(studentIds: string[], cutoff: AssessmentCutoff, recognition?: Map<string, SourceCreditRecognition>) {
  const result = new Map<string, Prisma.InputJsonValue[]>();
  if (studentIds.length === 0) return result;
  const offerings = await prisma.studentCourseOffering.findMany({
    where: { studentId: { in: studentIds }, academicTermId: { in: cutoff.termIds } },
    orderBy: { createdAt: "desc" },
  });
  const grades = offerings.length
    ? await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map((item) => item.id) } } })
    : [];
  const gradeByOffering = new Map(grades.map((grade) => [grade.offeringId, grade]));
  for (const offering of offerings) {
    const code = (offering.sCurriculumId || "").toUpperCase();
    const name = (offering.sCourseName || "").toLowerCase();
    if (code.startsWith("SHCD") || name.includes("sinh hoạt công dân")) continue;

    const grade = gradeByOffering.get(offering.id);
    const term = cutoff.termById.get(offering.academicTermId);
    const year = cutoff.yearById.get(offering.academicYearId);
    const rows = result.get(offering.studentId) || [];
    rows.push({
      id: offering.id,
      studentId: offering.sStudentId,
      courseCode: offering.sCurriculumId,
      courseName: offering.sCourseName,
      credits: offering.sCredits,
      academicYear: year?.sYearCode || null,
      termCode: term?.sTermCode || null,
      programCode: offering.sProgramCode,
      courseGroup: offering.sCourseGroup,
      score10: numberValue(grade?.score10),
      score4: numberValue(grade?.score4),
      letterGrade: grade?.letterCode || grade?.specialCode || null,
      specialCode: grade?.specialCode || null,
      isPassed: grade ? (grade.sourcePayload === undefined ? grade.isPass : sourcePassOutcome(grade.sourcePayload)) : null,
      isGather: grade?.isGather ?? false,
      notScore: grade?.notScore ?? false,
      scoreStatus: grade?.scoreStatus || "unknown",
      capturedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject);
    result.set(offering.studentId, rows);
  }

  // Store all attempts. Forecast aggregation is separate from historical evidence.
  for (const [studentId, source] of recognition ?? []) {
    const rows = result.get(studentId) ?? [];
    for (const attempt of source.attempts) rows.push(JSON.parse(JSON.stringify({ ...attempt,
      specialCode: attempt.recognition.kind === "UNDATED_CERTIFICATE" ? "M" : "R", letterGrade: attempt.letterCode || null,
      id: `recognition:${attempt.recognition.sourceRecordId}` })) as Prisma.InputJsonValue);
    result.set(studentId, rows);
  }

  return result;
}

export class GraduationEvaluationsService {
  /** Project old results without altering their immutable source snapshots. */
  static async getStatusOverrides(evaluationIds: string[]) {
    if (!evaluationIds.length) return [];
    const rows = await prisma.$queryRaw<Array<{
      id: string; evaluationId: string; studentId: string; classId: string | null;
      storedStatus: string; finalStatus: GraduationStatus; needsManualReview: boolean;
    }>>`
      SELECT s.id::text, s.evaluation_id::text AS "evaluationId", s.student_id::text AS "studentId",
        s.class_id::text AS "classId", s.final_status AS "storedStatus",
        CASE WHEN count(d.id) = 0 THEN 'MANUAL_REVIEW'
          WHEN bool_or(d.result = 'FAIL') THEN 'NOT_ELIGIBLE'
          WHEN bool_or(d.result = 'NOT_AVAILABLE') THEN 'MANUAL_REVIEW'
          WHEN bool_or(d.result = 'PENDING' AND d.rule_code IN ('PROGRAM_COMPLETION','CUMULATIVE_GPA','TOTAL_CREDITS','COMPULSORY_CREDITS','ELECTIVE_CREDITS')) THEN 'PENDING_GRADE'
          WHEN bool_or(d.result = 'PENDING') THEN 'PENDING_REQUIREMENT'
          ELSE 'EXPECTED_ELIGIBLE' END AS "finalStatus",
        (count(d.id) = 0 OR COALESCE(bool_or(d.result = 'NOT_AVAILABLE'), false)) AS "needsManualReview"
      FROM graduation_evaluation_students s
      LEFT JOIN graduation_evaluation_details d ON d.evaluation_student_id = s.id
        AND d.rule_code NOT IN ('WHOLE_COURSE_TRAINING', 'WHOLE_COURSE_TRAINING_CONFIG')
      WHERE s.evaluation_id = ANY(${evaluationIds}::uuid[])
        AND EXISTS (SELECT 1 FROM graduation_evaluation_details old WHERE old.evaluation_student_id = s.id
          AND old.rule_code IN ('WHOLE_COURSE_TRAINING', 'WHOLE_COURSE_TRAINING_CONFIG'))
      GROUP BY s.id
    `;
    return rows.filter(row => GRADUATION_STATUSES.includes(row.finalStatus));
  }

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

    const [program, classes, cutoff, ruleResolution, cohort] = await Promise.all([
      prisma.trainingProgram.findUnique({ where: { id: scope.trainingProgramId } }),
      prisma.class.findMany({
        where: { cohortId: scope.cohortId, deletedAt: null },
        select: { classId: true },
      }),
      loadAssessmentCutoff(scope.assessmentAcademicTermId),
      loadResolvedRules(scope),
      prisma.cohort.findUnique({ where: { id: scope.cohortId } }),
    ]);
    const targetType = normalizeTargetType(scope.targetType);
    const students = program
      ? await prisma.student.findMany({
          where: {
            deletedAt: null,
            sStudyProgramId: program.sProgramCode,
            sClassStudentId: { in: classes.map((item) => item.classId) },
            ...monitoredStudentWhere({ yearCode: cutoff.yearById.get(cutoff.termById.get(scope.assessmentAcademicTermId)!.academicYearId)!.sYearCode,
              termOrder: cutoff.termById.get(scope.assessmentAcademicTermId)!.sTermOrder }),
          },
          select: { id: true },
        })
      : [];
    const studentIds = students.map((student) => student.id);
    const assessment = cutoff.termById.get(scope.assessmentAcademicTermId)!;
    const recognition = await loadSourceCreditRecognitions(studentIds, program?.sProgramCode || "", {
      academicYear: cutoff.yearById.get(assessment.academicYearId)!.sYearCode, termCode: assessment.sTermCode, termOrder: assessment.sTermOrder,
    }, { includeUndatedConditional: assessment.isCurrent });
    const [derivedReqs, termSummaries] = studentIds.length
      ? await Promise.all([
          fetchDerivedRequirements(studentIds, cutoff.termIds, recognition),
          prisma.studentTermSummary.findMany({
            where: {
              studentId: { in: studentIds },
              sProgramCode: program?.sProgramCode || "",
              academicTermId: { in: cutoff.termIds },
              cumulativeGpa4: { not: null },
            },
            select: { studentId: true, cumulativeGpa4: true },
          }),
        ])
      : [new Map(), []];

    const verified = [...derivedReqs.values()].filter((item) => item.isVerified).length;
    const gpaAvailable = new Set(termSummaries.map((item) => item.studentId)).size;
    const curriculumCheck = buildGraduationForecast({
      programCode: program?.sProgramCode,
      courses: await loadProgramCurriculum(scope.trainingProgramId),
      grades: [],
      requiredElectiveCredits: numberValue(ruleResolution.ruleByCode.get("ELECTIVE_CREDITS")?.requiredValue),
      requiredTotalCredits: numberValue(ruleResolution.ruleByCode.get("TOTAL_CREDITS")?.requiredValue),
      requiredCompulsoryCredits: numberValue(ruleResolution.ruleByCode.get("COMPULSORY_CREDITS")?.requiredValue),
    });
    const curriculumReady = curriculumCheck.summary.remainingCredits !== null;
    const cohortNumber = Number(cohort?.sCohortCode.match(/\d+/)?.[0]);
    const assessmentYear = Number(completionPreview.scope.assessmentAcademicYear.split("-")[0]);
    const assessmentTerm = completionPreview.scope.assessmentTermCode === "HK01" ? 1 : 2;
    const semesterNo = (assessmentYear - (1976 + cohortNumber)) * 2 + assessmentTerm;
    const specializationNotDue = isK44StandardProgram(program?.sProgramCode) && !program?.sProgramCode.includes("-") && semesterNo < 6;

    const targetBlockers = [
      ...(targetType === "final_year"
        ? [{ code: "TARGET_TYPE_UNSUPPORTED", message: "Chưa có quy tắc chính thức để xác định nhóm sinh viên năm cuối." }]
        : []),
      ...(targetType === "overdue"
        ? [{ code: "OVERDUE_RULE_NOT_CONFIGURED", message: "Chưa có quy tắc chính thức để xác định sinh viên quá hạn chuẩn." }]
        : []),
      ...(scope.specialization?.trim()
        ? [{ code: "SPECIALIZATION_UNSUPPORTED", message: "Dữ liệu hiện chưa ánh xạ được CTĐT theo chuyên ngành; không thể lọc an toàn." }]
        : []),
    ];
    return {
      ...completionPreview,
      valid: completionPreview.valid && targetBlockers.length === 0,
      canRun: completionPreview.canRun && targetBlockers.length === 0,
      dataReadiness: {
        studentCount: students.length,
        missingCurriculum: completionPreview.summary.coverageValid && (curriculumReady || specializationNotDue) ? 0 : students.length,
        missingGpa: Math.max(0, students.length - gpaAvailable),
        missingVerifiedRequirements: Math.max(0, students.length - verified),
        resolvedRuleCount: ruleResolution.rules.length,
        missingRuleCodes: ruleResolution.missing,
      },
      warnings: [
        ...completionPreview.warnings,
        ...(ruleResolution.missing.length ? [{ code: "GRADUATION_RULES_INCOMPLETE", message: `Thiếu quy tắc cho CTĐT ${program?.sProgramCode || "chưa xác định"}: ${ruleResolution.missing.join(", ")}. Kết quả phụ thuộc các quy tắc này cần đối soát.` }] : []),
        ...(ruleResolution.conflicts.length ? [{ code: "GRADUATION_RULES_CONFLICT", message: `Quy tắc xung đột: ${ruleResolution.conflicts.join(", ")}.` }] : []),
        ...(ruleResolution.invalid.length ? [{ code: "GRADUATION_RULES_INVALID", message: `Ngưỡng không hợp lệ: ${ruleResolution.invalid.join(", ")}.` }] : []),
        ...(!curriculumReady ? [specializationNotDue
          ? { code: "SPECIALIZATION_NOT_DUE", message: "Sinh viên chưa đến học kỳ 6 để chọn chuyên ngành. Đối chiếu phần chung; chưa kết luận toàn bộ yêu cầu chuyên ngành." }
          : { code: "GRADUATION_CURRICULUM_INCOMPLETE", message: "Danh mục CTĐT hiện lưu chưa đủ để xác định toàn bộ tín chỉ còn thiếu; kết quả sinh viên sẽ cần đối soát." }] : []),
        ...(verified < students.length
          ? [{
              code: "GRADUATION_REQUIREMENTS_PENDING_CONFIRMATION",
              message: "Một số sinh viên đang chờ xác nhận hoàn thành hoặc công nhận/miễn GDTC, GDQP.",
              details: ["Giữ trạng thái chờ xác nhận điều kiện; không tự coi là đạt hoặc quy thành lỗi dữ liệu API."],
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
    const [cutoff, ruleResolution] = await Promise.all([
      loadAssessmentCutoff(scope.assessmentAcademicTermId),
      loadResolvedRules(scope),
    ]);
    const completionRun = await TrainingProgressService.triggerCompletionRun({
      cohortId: scope.cohortId,
      trainingProgramId: scope.trainingProgramId,
      assessmentAcademicTermId: scope.assessmentAcademicTermId,
      evaluationMode: "graduation_forecast",
    });
    const rules = ruleResolution.rules;
    const ruleVersions = [...new Set(rules.map((rule) => rule.version))];
    const ruleVersion = (ruleVersions.join("+") || "NO_ACTIVE_RULE").slice(0, 64);
    const curriculum = (await loadProgramCurriculum(scope.trainingProgramId))
      .filter((course) => !isExcludedFromGraduationCredits(course.courseCode, course.courseName));
    const currentPlanIds = preview.plans.map((plan) => plan.id);
    const planCourses = currentPlanIds.length
      ? await prisma.trainingProgressPlanCourse.findMany({ where: { planId: { in: currentPlanIds } } })
      : [];
    const planById = new Map(preview.plans.map((plan) => [plan.id, plan]));
    const schedule: ForecastSchedule[] = planCourses.flatMap((course) => {
      const plan = planById.get(course.planId);
      if (!plan) return [];
      return [{ courseId: course.courseId, courseCode: course.sCourseCode, courseName: course.sCourseName,
        academicYear: plan.academicYear, termCode: plan.termCode, semesterNo: plan.curriculumSemesterNo,
        choiceGroupCode: course.choiceGroupCode, isProgramFinal: plan.isProgramFinal }];
    });
    const snapshot = {
      calculationVersion: "curriculum-gap-v7",
      scope: preview.scope,
      readiness: preview.dataReadiness,
      completionRunId: completionRun.id,
      completionSnapshotHash: completionRun.sourceSnapshotHash,
      curriculum,
      schedule,
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
      const monitoringScope = await monitoredStudentResultWhere();
      const departed = new Set(monitoringScope.studentId?.notIn ?? []);
      const completionStudents = allCompletionStudents.filter(item => !departed.has(item.studentId));
      const studentIds = completionStudents.map((item) => item.studentId);

      const assessment = cutoff.termById.get(scope.assessmentAcademicTermId)!;
      const recognition = await loadSourceCreditRecognitions(studentIds, preview.scope.programCode, {
        academicYear: cutoff.yearById.get(assessment.academicYearId)!.sYearCode, termCode: assessment.sTermCode, termOrder: assessment.sTermOrder,
      }, { includeUndatedConditional: assessment.isCurrent });
      const [derivedReqs, gradeSnapshots] = await Promise.all([
        fetchDerivedRequirements(studentIds, cutoff.termIds, recognition),
        fetchGradeSnapshots(studentIds, cutoff, recognition),
      ]);

      const studentRows: Prisma.GraduationEvaluationStudentCreateManyInput[] = [];
      const detailRows: Prisma.GraduationEvaluationDetailCreateManyInput[] = [];
      const counts: Record<GraduationStatus, number> = {
        EXPECTED_ELIGIBLE: 0,
        PENDING_GRADE: 0,
        PENDING_REQUIREMENT: 0,
        NOT_ELIGIBLE: 0,
        MANUAL_REVIEW: 0,
      };

      const ruleByCode = ruleResolution.ruleByCode;
      const requiredElectiveCredits = numberValue(ruleByCode.get("ELECTIVE_CREDITS")?.requiredValue);
      const requiredTotalCredits = numberValue(ruleByCode.get("TOTAL_CREDITS")?.requiredValue);
      const requiredCompulsoryCredits = numberValue(ruleByCode.get("COMPULSORY_CREDITS")?.requiredValue);

      const gpaThreshold = numberValue(ruleByCode.get("CUMULATIVE_GPA")?.requiredValue);

      // Determine expected semester for cohort to isolate past backlogs vs future courses
      let cohortStartYear: number | null = null;
      const codeMatch = (preview.scope.cohortCode || "").match(/K(\d+)/i);
      if (codeMatch) {
        cohortStartYear = 2022 + (Number(codeMatch[1]) - 46);
      }
      const currentYearMatch = (preview.scope.assessmentAcademicYear || "").match(/^(\d{4})/);
      const currentYearStart = currentYearMatch ? Number(currentYearMatch[1]) : 2026;
      const yearDiff = cohortStartYear ? Math.max(0, currentYearStart - cohortStartYear) : 0;
      const expectedYear = yearDiff + 1;
      const termNo = (preview.scope.assessmentTermCode || "").includes("2") ? 2 : 1;
      const expectedSemesterNo = (expectedYear - 1) * 2 + termNo;
      const isFinalCohort = expectedSemesterNo >= 9;

      for (const student of completionStudents) {
        const derived = derivedReqs.get(student.studentId);
        const requirement = derived?.requirement;
        const forecast = buildGraduationForecast({
          programCode: student.sProgramCode,
          courses: curriculum,
          grades: (gradeSnapshots.get(student.studentId) ?? []) as ForecastGrade[],
          schedule,
          requiredElectiveCredits,
          requiredTotalCredits,
          requiredCompulsoryCredits,
        });
        const hasAcademicEvidence = (gradeSnapshots.get(student.studentId) ?? []).some((row) => {
          const value = row as Record<string, unknown>;
          return !isConditionalCourse(String(value.courseCode || ""), String(value.courseName || ""));
        });
        const compulsoryCredits = hasAcademicEvidence ? forecast.requirements.requiredCourses.completedCredits : null;
        const electiveCredits = hasAcademicEvidence ? forecast.requirements.electives.completedCredits : null;
        const pendingCompulsoryCredits = forecast.requirements.requiredCourses.pendingCredits ?? 0;
        const pendingElectiveCredits = forecast.requirements.electives.pendingCredits ?? 0;
        const gpa = numberValue(student.cumulativeGpa4);
        const totalCredits = hasAcademicEvidence ? forecast.summary.completedCredits : null;
        const pendingTotalCredits = forecast.summary.pendingCredits ?? 0;
        const programMapped = student.sProgramCode === preview.scope.programCode && curriculum.length > 0;
        
        const trulyMissingRequired = forecast.missingRequiredCourses.some((c) => c.state !== "no_score");
        const pendingRequired = forecast.missingRequiredCourses.some((c) => c.state === "no_score");
        
        const electiveRemaining = forecast.requirements.electives.remainingCredits ?? 0;
        const trulyMissingElective = electiveRemaining > pendingElectiveCredits;
        
        const totalRemaining = forecast.summary.remainingCredits ?? 0;
        const trulyMissingTotal = totalRemaining > pendingTotalCredits;
        
        let trulyMissingGroup = false;
        let pendingGroup = false;
        for (const group of forecast.electiveGroups) {
          const groupRemaining = group.remainingCredits ?? 0;
          const groupPending = group.pendingCredits ?? 0;
          if (groupRemaining > groupPending) trulyMissingGroup = true;
          else if (groupRemaining > 0) pendingGroup = true;
        }

        const knownCurriculumFailure = trulyMissingRequired || trulyMissingElective || trulyMissingTotal || trulyMissingGroup;
        const knownCurriculumPending = !knownCurriculumFailure && (
          pendingRequired || (electiveRemaining > 0) || (totalRemaining > 0) || pendingGroup
        );

        const curriculumDetermined = programMapped && forecast.summary.remainingCredits !== null &&
          forecast.electiveGroups.every((group) => group.remainingCredits !== null);
          
        const mappingReview = forecast.reconciliation.status === "REVIEW_REQUIRED";
        const curriculumResult: DetailResult = !programMapped || !hasAcademicEvidence || mappingReview ? "NOT_AVAILABLE"
          : knownCurriculumFailure ? "FAIL" : !curriculumDetermined ? "NOT_AVAILABLE" 
          : knownCurriculumPending ? "PENDING" : "PASS";

        const physicalStatus = derived?.physicalStatus || "NOT_AVAILABLE";
        const defenseStatus = derived?.defenseStatus || "NOT_AVAILABLE";
        const languageStatus = derived?.languageStatus || "NOT_AVAILABLE";
        const disciplineStatus = derived?.disciplineStatus || "NOT_AVAILABLE";
        const legalStatus = derived?.legalStatus || "NOT_AVAILABLE";

        const isCurriculumDetermined = programMapped;

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
            actualValue: curriculumResult === "PASS" ? "Đã hoàn thành" : `${forecast.missingRequiredCourses.length} học phần bắt buộc và ${forecast.requirements.electives.remainingCredits ?? "?"} TC tự chọn còn thiếu`,
            result: curriculumResult,
            reason: mappingReview ? "Cần đối chiếu ánh xạ học phần trong hệ thống; không tự quy đổi môn trùng tên hoặc tín chỉ." : curriculumResult === "FAIL" ? "Còn học phần bắt buộc hoặc tín chỉ CTĐT đã xác định chưa đạt."
              : curriculumResult === "NOT_AVAILABLE" ? "Chưa đủ quy tắc hoặc dữ liệu CTĐT để kết luận hoàn thành." : null,
            evidence: { completionRunId: completionRun.id, completionStudentResultId: student.id, hasAcademicEvidence, reconciliation: forecast.reconciliation },
          },
          {
            ruleCode: "CUMULATIVE_GPA",
            ruleName: "Điểm trung bình tích lũy hệ 4",
            category: "ACADEMIC",
            requiredValue: gpaThreshold == null ? null : `>= ${gpaThreshold.toFixed(2)}`,
            actualValue: gpa == null ? null : gpa.toFixed(2),
            result: gpa == null || gpaThreshold == null ? "NOT_AVAILABLE" : gpa >= gpaThreshold ? "PASS" : "FAIL",
            reason: gpaThreshold == null ? `MISSING_RULE: Chưa có ngưỡng GPA cho CTĐT ${student.sProgramCode}.` : gpa == null
              ? "UNKNOWN_REQUIREMENT: Chưa có GPA tích lũy tại mốc đánh giá."
              : gpa >= gpaThreshold
                ? null
                : `GPA ${gpa.toFixed(2)} thấp hơn ngưỡng ${gpaThreshold.toFixed(2)}.`,
            evidence: { source: "completion_run_snapshot", assessmentAcademicTermId: scope.assessmentAcademicTermId },
          },
          ...[
            ...(ruleByCode.has("PHYSICAL_EDUCATION") ? [["PHYSICAL_EDUCATION", "Chứng chỉ Giáo dục thể chất", physicalStatus, "NOT_PASSED"]] : []),
            ...(ruleByCode.has("NATIONAL_DEFENSE") ? [["NATIONAL_DEFENSE", "Chứng chỉ Giáo dục quốc phòng và an ninh", defenseStatus, "NOT_PASSED"]] : []),
          ].map(([ruleCode, ruleName, value, failedValue]) => {
            const result = requirementResult(value, failedValue);
            return {
              ruleCode,
              ruleName,
              category: "CERTIFICATE",
              requiredValue: "PASSED",
              actualValue: value,
              result,
              reason: resultReason(ruleCode, result, value),
              evidence: {
                source: requirement?.sourceSystem || "course_results",
                verifiedAt: requirement?.verifiedAt?.toISOString() || null,
                certificate: JSON.parse(JSON.stringify(ruleCode === "PHYSICAL_EDUCATION" ? derived?.certificates.physical : derived?.certificates.defense) || "null"),
              } as Prisma.InputJsonObject,
            } satisfies DetailDraft;
          }),
        ];

        for (const creditRule of [
          { code: "TOTAL_CREDITS", name: "Tổng tín chỉ tích lũy", actual: totalCredits, pending: pendingTotalCredits },
          { code: "COMPULSORY_CREDITS", name: "Tín chỉ bắt buộc", actual: compulsoryCredits, pending: pendingCompulsoryCredits },
          { code: "ELECTIVE_CREDITS", name: "Tín chỉ tự chọn", actual: electiveCredits, pending: pendingElectiveCredits },
        ]) {
          const rule = ruleByCode.get(creditRule.code);
          const required = numberValue(rule?.requiredValue);
          let result: DetailResult = "NOT_AVAILABLE";
          let reason: string | null = null;
          if (mappingReview || creditRule.actual == null || required == null) {
            result = "NOT_AVAILABLE";
            reason = mappingReview ? "Hệ thống cần đối chiếu ánh xạ học phần trước khi kết luận tín chỉ." : required == null ? `MISSING_RULE: Chưa có ngưỡng ${creditRule.name.toLowerCase()} cho CTĐT ${student.sProgramCode}.` : "Chưa có dữ liệu tín chỉ đủ tin cậy.";
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
            requiredValue: required == null ? rule?.requiredValue ?? null : `>= ${required}`,
            actualValue: creditRule.actual == null ? null : String(creditRule.actual),
            result,
            reason,
            evidence: { source: "completion_course_results", excludesNonProgramCredits: true },
          });
        }

        for (const code of ruleResolution.missing.filter((item) => !details.some((detail) => detail.ruleCode === item))) {
          details.push({ ruleCode: code, ruleName: code, category: "DATA", requiredValue: null, actualValue: null,
            result: "NOT_AVAILABLE", reason: `MISSING_RULE: Chưa có quy tắc ${code} áp dụng cho CTĐT ${student.sProgramCode}.`, evidence: { trainingProgramId: scope.trainingProgramId } });
        }
        for (const code of [...ruleResolution.conflicts, ...ruleResolution.invalid]) {
          details.push({ ruleCode: `${code}_CONFIG`, ruleName: code, category: "DATA", requiredValue: null, actualValue: null,
            result: "NOT_AVAILABLE", reason: `Quy tắc ${code} bị xung đột hoặc có ngưỡng không hợp lệ; cần đối soát.`, evidence: { trainingProgramId: scope.trainingProgramId } });
        }

        const status = resolveGraduationStatus(details);
        const needsManualReview = details.some((detail) => detail.result === "NOT_AVAILABLE");
        counts[status]++;
        const reasons: Array<{
          code: string;
          result: DetailResult;
          message: string;
          courseCode?: string;
          courseName?: string;
          credits?: number;
          semesterNo?: number | null;
          isBacklog?: boolean;
          isMandatory?: boolean;
        }> = [];

        // 1. Failed courses (mandatory or elective failed attempts)
        for (const course of forecast.failedCourses) {
          const courseSem = course.schedule?.semesterNo ?? course.semesterNo ?? null;
          reasons.push({
            code: "FAILED_COURSE",
            result: "FAIL",
            message: `Học phần ${course.courseCode} - ${course.courseName} chưa đạt (cần trả nợ).`,
            courseCode: course.courseCode,
            courseName: course.courseName,
            credits: course.credits,
            semesterNo: courseSem,
            isBacklog: true,
            isMandatory: /bắt buộc|mandatory/i.test(course.requirementType),
          });
        }

        // 2. Missing required courses (distinguish overdue backlogs from past semesters vs future courses)
        let overdueMandatoryCount = 0;
        for (const course of forecast.missingRequiredCourses) {
          if (course.state === "failed") continue;
          if (!isFinalCohort && course.state === "no_score") continue; // Exclude courses currently being taken for ongoing students
          const courseSem = course.schedule?.semesterNo ?? course.semesterNo ?? 0;
          const isOverdue = !isFinalCohort ? (Boolean(courseSem) && courseSem < expectedSemesterNo) : true;

          if (isOverdue) {
            overdueMandatoryCount++;
            reasons.push({
              code: isFinalCohort ? "MISSING_REQUIRED_COURSE" : "OVERDUE_MANDATORY_COURSE",
              result: "FAIL",
              message: isFinalCohort
                ? (course.state === "no_score"
                  ? `Học phần bắt buộc ${course.courseCode} - ${course.courseName} chưa có điểm đạt.`
                  : `Chưa hoàn thành ${course.courseCode} - ${course.courseName}.`)
                : `Học phần bắt buộc ${course.courseCode} - ${course.courseName} (Học kỳ ${courseSem || "?"}) chưa hoàn thành.`,
              courseCode: course.courseCode,
              courseName: course.courseName,
              credits: course.credits,
              semesterNo: courseSem,
              isBacklog: true,
              isMandatory: true,
            });
          }
        }

        // 3. Missing elective credits by group
        for (const group of forecast.electiveGroups) {
          if (group.remainingCredits !== null && group.remainingCredits > 0) {
            reasons.push({
              code: "MISSING_ELECTIVE_CREDITS",
              result: "FAIL",
              message: `Nhóm tự chọn ${group.code} còn thiếu ${group.remainingCredits} tín chỉ.`,
            });
          }
        }

        // 4. Overall elective shortfall if not covered by individual groups
        if (
          forecast.requirements.electives.remainingCredits !== null &&
          forecast.requirements.electives.remainingCredits > 0 &&
          !forecast.electiveGroups.some((g) => g.remainingCredits !== null && g.remainingCredits > 0)
        ) {
          reasons.push({
            code: "MISSING_ELECTIVE_CREDITS",
            result: "FAIL",
            message: `Còn thiếu ${forecast.requirements.electives.remainingCredits} tín chỉ tự chọn theo CTĐT.`,
          });
        }

        // 5. Details that are not PASS
        for (const detail of details) {
          if (detail.result === "PASS") continue;
          if (detail.ruleCode === "PROGRAM_COMPLETION") continue; // already detailed in courses

          let reasonCode = detail.ruleCode;
          if (detail.result === "NOT_AVAILABLE") {
            if (detail.reason?.startsWith("MISSING_RULE")) {
              reasonCode = "MISSING_RULE";
            } else {
              reasonCode = "UNKNOWN_REQUIREMENT";
            }
          }
          reasons.push({
            code: reasonCode,
            result: detail.result,
            message: detail.reason || detail.ruleName,
          });
        }
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
          curriculumStatus: curriculumResult === "PASS" ? "PASSED" : curriculumResult === "FAIL" ? "NOT_PASSED" : "NOT_AVAILABLE",
          physicalEducationStatus: physicalStatus,
          nationalDefenseStatus: defenseStatus,
          foreignLanguageStatus: languageStatus,
          trainingStatus: "NOT_APPLICABLE",
          disciplineStatus,
          legalStatus,
          wholeCourseTrainingScore: null,
          missingRequiredCourses: isFinalCohort ? forecast.missingRequiredCourses.length : overdueMandatoryCount,
          missingElectiveCredits: forecast.requirements.electives.remainingCredits,
          pendingResultCourses: forecast.noScoreCourses.length,
          finalStatus: status,
          needsManualReview,
          reasons: reasons as unknown as Prisma.InputJsonValue,
          gradeSnapshot: (gradeSnapshots.get(student.studentId) || []) as Prisma.InputJsonValue,
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
    filters: { cohortId?: string; trainingProgramId?: string; termId?: string; status?: string; latestPerScope?: boolean },
    page: number,
    pageSize: number,
    scopeWhere: Prisma.GraduationEvaluationWhereInput = {},
    actor?: Actor,
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
    // The picker shows the latest completed calculation for each assessment
    // scope. Keep the unfiltered history and direct evaluation IDs accessible.
    // Deduplicate before pagination so older runs cannot crowd out a scope.
    const latestScopes = filters.latestPerScope ? await prisma.graduationEvaluation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["cohortId", "trainingProgramId", "assessmentAcademicTermId", "specialization", "targetType"],
      select: { id: true, cohortId: true, trainingProgramId: true, assessmentAcademicTermId: true, specialization: true, targetType: true },
    }) : null;
    const pageIds = latestScopes?.slice((page - 1) * pageSize, page * pageSize).map((item) => item.id);
    const [total, evaluations] = await Promise.all([
      latestScopes ? Promise.resolve(latestScopes.length) :
      prisma.graduationEvaluation.count({ where }),
      prisma.graduationEvaluation.findMany({
        where: pageIds ? { AND: [where, { id: { in: pageIds } }] } : where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pageIds ? 0 : (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const monitoringScope = await monitoredStudentResultWhere();
    const classScopes = actor ? await runClassScopes(actor, evaluations.map(item => ({
      id: item.id, academicTermId: item.assessmentAcademicTermId,
      cohortId: item.cohortId, trainingProgramId: item.trainingProgramId,
    }))) : null;
    const currentCounts = evaluations.length
      ? await prisma.graduationEvaluationStudent.groupBy({
          by: ["evaluationId", "finalStatus"],
          where: { ...monitoringScope, OR: evaluations.map(item => ({
            evaluationId: item.id,
            ...(classScopes?.get(item.id) != null ? { classId: { in: classScopes.get(item.id)! } } : {}),
          })) },
          _count: { _all: true },
        })
      : null;
    const overrides = await this.getStatusOverrides(evaluations.map(item => item.id));
    for (const row of overrides) {
      if (monitoringScope.studentId?.notIn.includes(row.studentId)) continue;
      const allowed = classScopes?.get(row.evaluationId);
      if (allowed != null && !allowed.includes(row.classId || "")) continue;
      if (!currentCounts || row.storedStatus === row.finalStatus) continue;
      const old = currentCounts.find(c => c.evaluationId === row.evaluationId && c.finalStatus === row.storedStatus);
      if (old) old._count._all--;
      const next = currentCounts.find(c => c.evaluationId === row.evaluationId && c.finalStatus === row.finalStatus);
      if (next) next._count._all++;
      else currentCounts.push({ evaluationId: row.evaluationId, finalStatus: row.finalStatus, _count: { _all: 1 } });
    }
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
        const restricted = classScopes?.get(item.id) != null;
        const snapshot = graduationSnapshotWithoutConduct(item.sourceSnapshot && typeof item.sourceSnapshot === "object" && !Array.isArray(item.sourceSnapshot) ? item.sourceSnapshot : {});
        return {
          ...item,
          sourceSnapshot: snapshot,
          // Readiness and warnings describe the entire calculation cohort.
          // Advisors receive the shared curriculum/rules, without those totals.
          ...(restricted ? { sourceSnapshot: Object.fromEntries(Object.entries(snapshot).filter(([key]) => ["calculationVersion", "curriculum", "schedule", "rules"].includes(key))) } : {}),
          ...(currentCounts ? {
            totalStudents: currentCounts.filter(row => row.evaluationId === item.id).reduce((sum, row) => sum + row._count._all, 0),
            expectedEligibleStudents: currentCounts.find(row => row.evaluationId === item.id && row.finalStatus === "EXPECTED_ELIGIBLE")?._count._all ?? 0,
            pendingGradeStudents: currentCounts.find(row => row.evaluationId === item.id && row.finalStatus === "PENDING_GRADE")?._count._all ?? 0,
            pendingRequirementStudents: currentCounts.find(row => row.evaluationId === item.id && row.finalStatus === "PENDING_REQUIREMENT")?._count._all ?? 0,
            notEligibleStudents: currentCounts.find(row => row.evaluationId === item.id && row.finalStatus === "NOT_ELIGIBLE")?._count._all ?? 0,
            manualReviewStudents: currentCounts.find(row => row.evaluationId === item.id && row.finalStatus === "MANUAL_REVIEW")?._count._all ?? 0,
          } : {}),
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

  static async getEvaluation(id: string, actor?: Actor) {
    const result = await this.listEvaluations({}, 1, 1, { id }, actor);
    return result.items[0] || null;
  }

  static async listStudents(
    evaluationId: string,
    filters: { status?: string; keyword?: string; classId?: string },
    page: number,
    pageSize: number,
    allowedClassIds?: string[] | null,
  ) {
    const monitoringScope = await monitoredStudentResultWhere();
    const classScope = filters.classId
      ? allowedClassIds && !allowedClassIds.includes(filters.classId) ? { in: [] as string[] } : filters.classId
      : allowedClassIds !== undefined && allowedClassIds !== null ? { in: allowedClassIds } : undefined;
    const overrides = (await this.getStatusOverrides([evaluationId])).filter(row =>
      !monitoringScope.studentId?.notIn.includes(row.studentId) && (typeof classScope === "string"
        ? row.classId === classScope : classScope === undefined || classScope.in.includes(row.classId || "")));
    const overrideById = new Map(overrides.map(row => [row.id, row]));
    const effectiveStatusFilter = filters.status && overrides.length ? { OR: [
      { id: { in: overrides.filter(row => row.finalStatus === filters.status).map(row => row.id) } },
      { finalStatus: filters.status, id: { notIn: overrides.map(row => row.id) } },
    ] } : filters.status ? { finalStatus: filters.status } : {};
    const where: Prisma.GraduationEvaluationStudentWhereInput = {
      evaluationId,
      ...monitoringScope,
      ...(filters.status ? overrides.length ? { AND: [effectiveStatusFilter] } : { finalStatus: filters.status } : {}),
      ...(filters.keyword ? {
        OR: [
          { sStudentId: { contains: filters.keyword, mode: "insensitive" } },
          { sStudentName: { contains: filters.keyword, mode: "insensitive" } },
          { sClassName: { contains: filters.keyword, mode: "insensitive" } },
        ],
      } : {}),
      ...(classScope !== undefined ? { classId: classScope } : {}),
    };
    const scopeWhere: Prisma.GraduationEvaluationStudentWhereInput = {
      evaluationId,
      ...monitoringScope,
      ...(classScope !== undefined ? { classId: classScope } : {}),
    };
    const classWhere: Prisma.GraduationEvaluationStudentWhereInput = {
      evaluationId,
      ...monitoringScope,
      ...(allowedClassIds != null ? { classId: { in: allowedClassIds } } : {}),
    };
    const [studentPage, statuses, classes] = await Promise.all([
      orderedStudentResultPage(
        () => prisma.graduationEvaluationStudent.findMany({ where, select: { id: true, sStudentId: true, sStudentName: true, sClassName: true } }),
        ids => prisma.graduationEvaluationStudent.findMany({ where: { AND: [where, { id: { in: ids } }] }, omit: { gradeSnapshot: true } }),
        page, pageSize,
      ),
      prisma.graduationEvaluationStudent.groupBy({ by: ["finalStatus"], where: scopeWhere, _count: { _all: true } }),
      prisma.graduationEvaluationStudent.groupBy({ by: ["classId", "sClassName"], where: classWhere, _count: { _all: true }, orderBy: { sClassName: "asc" } }),
    ]);
    const { total, items } = studentPage;
    for (const row of overrides) {
      if (row.storedStatus === row.finalStatus) continue;
      const old = statuses.find(s => s.finalStatus === row.storedStatus); if (old) old._count._all--;
      const next = statuses.find(s => s.finalStatus === row.finalStatus);
      if (next) next._count._all++; else statuses.push({ finalStatus: row.finalStatus, _count: { _all: 1 } });
    }
    return {
      statusCounts: Object.fromEntries([["all", statuses.reduce((sum, group) => sum + group._count._all, 0)], ...statuses.map((group) => [group.finalStatus, group._count._all])]),
      classes: classes.map((group) => ({ classId: group.classId, className: group.sClassName, count: group._count._all })),
      items: items.map((item) => {
        const reasons = graduationReasonsWithoutConduct(item.reasons) as Array<Record<string, unknown>>;
        const overdueMandatoryCourses = reasons.filter((r) => r.code === "OVERDUE_MANDATORY_COURSE");
        const failedCourses = reasons.filter((r) => r.code === "FAILED_COURSE");
        const failedMandatoryCourses = failedCourses.filter((r) => r.isMandatory === true);
        const failedElectiveCourses = failedCourses.filter((r) => r.isMandatory === false);
        const electiveGroupBacklogs = reasons.filter((r) => r.code === "MISSING_ELECTIVE_CREDITS");

        const overdueMandatoryCount = overdueMandatoryCourses.length;
        const failedCount = failedCourses.length;
        const electiveBacklogCount = failedElectiveCourses.length + electiveGroupBacklogs.length;
        const totalBacklogCount = overdueMandatoryCount + failedCount + electiveGroupBacklogs.length;

        const hasOverdueMandatory = overdueMandatoryCount > 0;
        const hasFailed = failedCount > 0;
        const hasElectiveBacklog = electiveBacklogCount > 0;
        const hasNoBacklog = !hasOverdueMandatory && !hasFailed && !hasElectiveBacklog;

        return {
          ...omitGraduationConduct(item),
          ...(overrideById.has(item.id) ? { finalStatus: overrideById.get(item.id)!.finalStatus, needsManualReview: overrideById.get(item.id)!.needsManualReview } : {}),
          reasons,
          totalCredits: numberValue(item.totalCredits),
          compulsoryCredits: numberValue(item.compulsoryCredits),
          electiveCredits: numberValue(item.electiveCredits),
          cumulativeGpa4: numberValue(item.cumulativeGpa4),
          backlog: {
            status: hasNoBacklog ? "NO_BACKLOG" : hasFailed ? "HAS_FAILED" : hasOverdueMandatory ? "HAS_OVERDUE" : "HAS_ELECTIVE_OVERDUE",
            hasNoBacklog,
            hasOverdueMandatory,
            hasFailed,
            hasElectiveBacklog,
            overdueMandatoryCount,
            failedCount,
            failedMandatoryCount: failedMandatoryCourses.length,
            failedElectiveCount: failedElectiveCourses.length,
            electiveBacklogCount,
            totalBacklogCount,
            overdueMandatoryCourses: overdueMandatoryCourses.map((r) => ({
              courseCode: String(r.courseCode || ""),
              courseName: String(r.courseName || ""),
              credits: Number(r.credits || 0),
              semesterNo: Number(r.semesterNo || 0),
            })),
            failedCourses: failedCourses.map((r) => ({
              courseCode: String(r.courseCode || ""),
              courseName: String(r.courseName || ""),
              credits: Number(r.credits || 0),
              letterGrade: r.letterGrade ? String(r.letterGrade) : undefined,
              semesterNo: r.semesterNo ? Number(r.semesterNo) : null,
              isMandatory: Boolean(r.isMandatory),
            })),
            failedElectiveCourses: failedElectiveCourses.map((r) => ({
              courseCode: String(r.courseCode || ""),
              courseName: String(r.courseName || ""),
              credits: Number(r.credits || 0),
              letterGrade: r.letterGrade ? String(r.letterGrade) : undefined,
            })),
            electiveGroupBacklogs: electiveGroupBacklogs.map((r) => ({
              groupCode: String(r.groupCode || ""),
              message: String(r.message || ""),
              remainingCredits: Number(r.remainingCredits || 0),
            })),
            pendingCount: Number(item.pendingResultCourses || 0),
          },
        };
      }),
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
    const storedGrades = Array.isArray(student.gradeSnapshot)
      ? student.gradeSnapshot as Array<Record<string, unknown>>
      : [];
    const sourceSnapshot = evaluation.sourceSnapshot as Record<string, unknown> | null;
    const hasFullSnapshot = sourceSnapshot !== null && ["curriculum-gap-v2", "curriculum-gap-v3", "curriculum-gap-v4", "curriculum-gap-v5", "curriculum-gap-v6", "curriculum-gap-v7"].includes(String(sourceSnapshot?.calculationVersion)) &&
      Array.isArray(sourceSnapshot.curriculum) && Array.isArray(sourceSnapshot.schedule);
    const studentProgram = student.sProgramCode
      ? await prisma.trainingProgram.findFirst({ where: { sProgramCode: student.sProgramCode, deletedAt: null } })
      : null;
    const programId = studentProgram?.id ?? evaluation.trainingProgramId;
    const [details, liveGrades, programCourses, plans, studiedOfferings] = await Promise.all([
      prisma.graduationEvaluationDetail.findMany({
        where: { evaluationStudentId: student.id, ruleCode: { notIn: ["WHOLE_COURSE_TRAINING", "WHOLE_COURSE_TRAINING_CONFIG"] } },
        orderBy: [{ category: "asc" }, { ruleCode: "asc" }],
      }),
      !hasFullSnapshot && storedGrades.length === 0 ? GradesService.list(student.studentId) : Promise.resolve([]),
      hasFullSnapshot ? Promise.resolve([]) : prisma.trainingProgramCourse.findMany({ where: { trainingProgramId: programId } }),
      hasFullSnapshot ? Promise.resolve([]) : prisma.trainingProgressPlan.findMany({
        where: { cohortId: evaluation.cohortId, trainingProgramId: programId, status: "locked", isCurrent: true },
        orderBy: [{ curriculumSemesterNo: "asc" }, { version: "desc" }],
      }),
      // Recommendations are for future registration: also exclude courses
      // studied after this evaluation, including offerings without a grade.
      prisma.studentCourseOffering.findMany({
        where: { studentId: student.studentId },
        select: { sCurriculumId: true },
      }),
    ]);
    const rawGrades = (hasFullSnapshot || storedGrades.length > 0 ? storedGrades : liveGrades) as Awaited<ReturnType<typeof GradesService.list>>;
    const studiedCourseCodes = new Set([
      ...studiedOfferings.map(offering => offering.sCurriculumId),
      ...rawGrades.map(grade => String(grade.courseCode || (grade as Record<string, unknown>).sCurriculumId || "")),
    ]);
    const grades = rawGrades.filter((g) => {
      const code = String(g.courseCode || (g as Record<string, unknown>).sCurriculumId || "").toUpperCase();
      const name = String(g.courseName || (g as Record<string, unknown>).sCourseName || "").toLowerCase();
      return code && !code.startsWith("SHCD") && !name.includes("sinh hoạt công dân");
    });
    const planIds = plans.map((plan) => plan.id);
    const termIds = [...new Set(plans.map((plan) => plan.academicTermId))];
    const [courseCatalog, planCourses, terms] = hasFullSnapshot
      ? [[], [], []]
      : await Promise.all([
          programCourses.length
            ? prisma.course.findMany({ where: { id: { in: programCourses.map((course) => course.courseId) } } })
            : Promise.resolve([]),
          planIds.length
            ? prisma.trainingProgressPlanCourse.findMany({ where: { planId: { in: planIds } } })
            : Promise.resolve([]),
          termIds.length
            ? prisma.academicTerm.findMany({ where: { id: { in: termIds } } })
            : Promise.resolve([]),
        ]);
    const years = terms.length
      ? await prisma.academicYear.findMany({ where: { id: { in: terms.map((term) => term.academicYearId) } } })
      : [];
    const catalogById = new Map(courseCatalog.map((course) => [course.id, course]));
    const termById = new Map(terms.map((term) => [term.id, term]));
    const yearById = new Map(years.map((year) => [year.id, year]));
    const electiveDetail = details.find((detail) => detail.ruleCode === "ELECTIVE_CREDITS");
    const totalDetail = details.find((detail) => detail.ruleCode === "TOTAL_CREDITS");
    const parseThreshold = (value: string | null | undefined) => {
      const match = value?.match(/\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };
    const electiveMinimum = parseThreshold(electiveDetail?.requiredValue);
    const forecast = buildGraduationForecast({
      programCode: ["curriculum-gap-v3", "curriculum-gap-v4", "curriculum-gap-v5", "curriculum-gap-v6", "curriculum-gap-v7"].includes(String(sourceSnapshot?.calculationVersion)) ? student.sProgramCode : undefined,
      courses: hasFullSnapshot ? sourceSnapshot.curriculum as ForecastCourse[] : studentProgram ? programCourses.flatMap((item) => {
        const course = catalogById.get(item.courseId);
        if (!course || isExcludedFromGraduationCredits(course.sCourseCode, course.sCourseName)) return [];
        return [{ courseId: item.courseId, courseCode: course.sCourseCode, courseName: course.sCourseName,
          credits: item.sCredits, requirementType: item.sRequirementType, semesterNo: item.sSemesterNo }];
      }) : [],
      grades,
      requiredElectiveCredits: electiveMinimum,
      requiredTotalCredits: parseThreshold(totalDetail?.requiredValue),
      requiredCompulsoryCredits: parseThreshold(details.find((detail) => detail.ruleCode === "COMPULSORY_CREDITS")?.requiredValue),
      schedule: hasFullSnapshot ? sourceSnapshot.schedule as ForecastSchedule[] : planCourses.flatMap((course) => {
        const plan = plans.find((item) => item.id === course.planId);
        const term = plan ? termById.get(plan.academicTermId) : null;
        const year = term ? yearById.get(term.academicYearId) : null;
        if (!plan || !term || !year) return [];
        return [{
          courseId: course.courseId,
          courseCode: course.sCourseCode,
          courseName: course.sCourseName,
          academicYear: year.sYearCode,
          termCode: term.sTermCode,
          semesterNo: plan.curriculumSemesterNo,
          choiceGroupCode: course.choiceGroupCode,
          isProgramFinal: plan.is_program_final,
        }];
      }),
    });
    if (["curriculum-gap-v3", "curriculum-gap-v4", "curriculum-gap-v5", "curriculum-gap-v6", "curriculum-gap-v7"].includes(String(sourceSnapshot?.calculationVersion)) &&
        !grades.some((grade) => !isConditionalCourse(grade.courseCode, grade.courseName))) {
      forecast.curriculumComplete = null;
      forecast.summary.completedCredits = null;
      forecast.summary.remainingCredits = null;
      forecast.summary.completionPercent = null;
      forecast.warnings.push("Chưa có bảng điểm học thuật trong phạm vi nguồn của sinh viên; chưa thể xác nhận tín chỉ đã tích lũy.");
    }
    if (!hasFullSnapshot && !studentProgram && student.sProgramCode) {
      forecast.warnings.push("Không tìm thấy CTĐT theo mã của sinh viên; chưa thể tính tín chỉ tốt nghiệp.");
    } else if (programId !== evaluation.trainingProgramId) {
      forecast.warnings.push("CTĐT của sinh viên khác CTĐT của đợt đánh giá; kết quả đối chiếu cần xác minh.");
    }

    const assessmentTerm = await prisma.academicTerm.findUnique({ where: { id: evaluation.assessmentAcademicTermId } });
    const assessmentYear = assessmentTerm ? await prisma.academicYear.findUnique({ where: { id: assessmentTerm.academicYearId } }) : null;
    const studentFormatted = {
      ...omitGraduationConduct(student),
      finalStatus: details.length ? resolveGraduationStatus(details.map(detail => ({ ruleCode: detail.ruleCode, result: detail.result as DetailResult }))) : student.finalStatus,
      needsManualReview: details.some(detail => isGraduationCriterionEnabled(detail.ruleCode) && detail.result === "NOT_AVAILABLE"),
      reasons: graduationReasonsWithoutConduct(student.reasons),
      assessmentAcademicYear: assessmentYear?.sYearCode ?? null,
      assessmentTermCode: assessmentTerm?.sTermCode ?? null,
      totalCredits: numberValue(student.totalCredits),
      compulsoryCredits: numberValue(student.compulsoryCredits),
      electiveCredits: numberValue(student.electiveCredits),
      cumulativeGpa4: numberValue(student.cumulativeGpa4),
    };

    const curriculumInfo = studentProgram ? {
      id: studentProgram.id,
      programCode: studentProgram.sProgramCode,
      programName: studentProgram.sProgramName,
      degreeLevel: studentProgram.sDegreeLevel,
      major: studentProgram.sMajor,
      studyType: studentProgram.sStudyType,
    } : {
      programCode: student.sProgramCode || "UNKNOWN",
      programName: student.sProgramCode ? `Chương trình ${student.sProgramCode}` : "Chưa xác định",
      degreeLevel: "Đại học",
      major: "Công nghệ thông tin",
      studyType: "Chính quy",
    };

    const completion = {
      curriculumComplete: forecast.curriculumComplete,
      requiredCredits: forecast.summary.requiredCredits,
      completedCredits: forecast.summary.completedCredits,
      remainingCredits: forecast.summary.remainingCredits,
      completionPercent: forecast.summary.completionPercent,
    };

    const requiredCourses = {
      completed: forecast.requiredCoursesBreakdown.completed,
      missing: forecast.requiredCoursesBreakdown.missing,
      failed: forecast.requiredCoursesBreakdown.failed,
      noScore: forecast.requiredCoursesBreakdown.noScore,
    };

    const graduationRequirements = details.map((detail) => ({
      code: detail.ruleCode,
      required: detail.requiredValue,
      actual: detail.actualValue,
      status: detail.result === "NOT_AVAILABLE" ? "UNKNOWN" : detail.result,
      reason: detail.reason,
    }));

    return {
      // SPEC 14 standardized output:
      student: studentFormatted,
      curriculum: curriculumInfo,
      completion,
      requiredCourses,
      electiveGroups: forecast.electiveGroups,
      graduationRequirements,
      finalStatus: studentFormatted.finalStatus,
      needsManualReview: studentFormatted.needsManualReview,
      reasons: studentFormatted.reasons,
      warnings: forecast.warnings,

      // Retain backward compatibility properties for existing UI:
      evaluation: {
        id: evaluation.id,
        evaluationCode: evaluation.evaluationCode,
        ruleVersion: evaluation.ruleVersion,
        sourceCapturedAt: evaluation.sourceCapturedAt,
        calculationVersion: (evaluation.sourceSnapshot as Record<string, unknown>)?.calculationVersion ?? null,
      },
      requirements: details.filter(detail => isGraduationCriterionEnabled(detail.ruleCode)),
      missingCourses: [...forecast.missingRequiredCourses, ...forecast.electiveOptions],
      pendingCourses: forecast.noScoreCourses,
      missingMandatoryCourses: forecast.missingRequiredCourses,
      mandatoryAnalysis: {
        requiredCredits: forecast.requirements.requiredCourses.requiredCredits,
        accumulatedCredits: forecast.requirements.requiredCourses.completedCredits,
        isSatisfied: forecast.requirements.requiredCourses.remaining === 0,
        failedCourses: forecast.failedCourses.filter((course) => /bắt buộc|mandatory/i.test(course.requirementType)),
        unregisteredCourses: forecast.missingRequiredCourses.filter((course) => course.state === "not_completed"),
        pendingCourses: forecast.noScoreCourses.filter((course) => /bắt buộc|mandatory/i.test(course.requirementType)),
      },
      electiveAnalysis: {
        requiredCredits: forecast.requirements.electives.requiredCredits,
        accumulatedCredits: forecast.requirements.electives.passedCredits,
        missingCredits: forecast.requirements.electives.remainingCredits,
        excessCredits: forecast.requirements.electives.excessCredits,
        isSatisfied: forecast.requirements.electives.remainingCredits === 0,
        failedCourses: forecast.failedCourses.filter((course) => /tự chọn|elective/i.test(course.requirementType)),
        availableOptions: forecast.electiveOptions,
        groups: forecast.electiveGroups,
      },
      grades,
      gradeDataSource: hasFullSnapshot || storedGrades.length > 0 ? "evaluation_snapshot" : "live_fallback",
      forecast: {
        ...forecast,
        electiveReplacementGroups: forecast.failedCourses.filter(course => /tự chọn|elective/i.test(course.requirementType)).flatMap(course => {
          const group = k44ElectiveAlternatives(course.courseCode, student.sProgramCode ?? "", studiedCourseCodes);
          return group ? [{ courseCode: course.courseCode, ...group }] : [];
        }),
      },
    };
  }
}
