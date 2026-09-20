import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { ApiError } from "@/lib/utils/api-error";

// ============================================================================
// Types
// ============================================================================

interface PlanCourse {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;       // "mandatory" | "elective"
  choiceGroupCode: string | null;
  isRegistrationRequired: boolean;
}

interface RegistrationSnapshot {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
}

interface ChoiceGroupResult {
  code: string;
  requiredCourses: number;
  registeredCourses: number;
  requiredCredits: number;
  registeredCredits: number;
  selectedCourseIDs: string[];
  status: string; // "pass" | "missing" | "over_registered"
}

interface ProgressEvaluation {
  mandatoryRequiredCourses: number;
  mandatoryRegisteredCourses: number;
  mandatoryRequiredCredits: number;
  mandatoryRegisteredCredits: number;
  missingMandatoryCourses: number;
  requiredElectiveCourses: number;
  registeredRequiredElectiveCourses: number;
  missingRequiredElectiveCourses: number;
  requiredElectiveCredits: number;
  registeredElectiveCredits: number;
  missingCredits: number;
  outsidePlanCourses: number;
  outsidePlanCredits: number;
  choiceGroupResults: ChoiceGroupResult[];
  status: string; // "pass" | "fail" | "data_error"
  courses: { courseId: string; courseCode: string; courseName: string; credits: number; group: string; choiceGroupCode: string; isRegistrationRequired: boolean; registrationStatus: string }[];
}

interface PassingEvidence {
  offeringId: string;
  studentId: string;
  courseId: string;
  academicYear: string;
  termCode: string;
  termOrder: number;
  scoreStatus: string;
}

interface CompletionPlan {
  id: string;
  version: number;
  academicTermId: string;
  academicYearCode: string;
  termOrder: number;
  termCode: string;
  curriculumSemesterNo: number;
  requiredElective: number;
  status: string;
  isCurrent: boolean;
  isProgramFinal: boolean;
  courses: PlanCourse[];
}

interface CompletionPlanResult {
  planId: string;
  planVersion: number;
  academicTermId: string;
  curriculumSemesterNo: number;
  isDue: boolean;
  isPass: boolean;
  missingMandatoryCourses: number;
  missingRequiredElectives: number;
  requiredElectiveCredits: number;
  passedElectiveCredits: number;
  missingElectiveCredits: number;
  pendingResultCourses: number;
  pendingOnly: boolean;
  choiceGroups: ChoiceGroupResult[];
  courses: Array<PlanCourse & {
    passed: boolean;
    pendingResult: boolean;
    evidence: PassingEvidence | null;
  }>;
}

interface CalcStudent {
  id: string;
  studentCode: string;
  studentName: string;
  classId: string;
  classCode: string;
  className: string;
  cohortId: string;
  cohortCode: string;
  programCode: string;
  dataError: boolean;
}

// ============================================================================
// Pure Logic Functions (no DB access — ported from SWE Golang)
// ============================================================================

/**
 * evaluateProgress: Compares plan courses vs student registrations.
 * This is the REAL calculation engine ported from SWE service.go L1122–L1224.
 */
export function evaluateProgress(
  courses: PlanCourse[],
  registrations: RegistrationSnapshot[],
  dataError: boolean,
): ProgressEvaluation {
  const byCourse = new Map<string, RegistrationSnapshot>();
  for (const r of registrations) {
    byCourse.set(r.courseId, r);
  }

  const planCourseIds = new Set(courses.map((c) => c.courseId));

  const eval_: ProgressEvaluation = {
    mandatoryRequiredCourses: 0,
    mandatoryRegisteredCourses: 0,
    mandatoryRequiredCredits: 0,
    mandatoryRegisteredCredits: 0,
    missingMandatoryCourses: 0,
    requiredElectiveCourses: 0,
    registeredRequiredElectiveCourses: 0,
    missingRequiredElectiveCourses: 0,
    requiredElectiveCredits: 0,
    registeredElectiveCredits: 0,
    missingCredits: 0,
    outsidePlanCourses: 0,
    outsidePlanCredits: 0,
    choiceGroupResults: [],
    status: "pass",
    courses: [],
  };

  const choiceGroups = new Map<string, PlanCourse[]>();

  for (const course of courses) {
    const registered = byCourse.has(course.courseId);
    eval_.courses.push({
      courseId: course.courseId,
      courseCode: course.courseCode,
      courseName: course.courseName,
      credits: course.credits,
      group: course.requirementType,
      choiceGroupCode: course.choiceGroupCode || "",
      isRegistrationRequired: course.isRegistrationRequired,
      registrationStatus: registered ? "registered" : "missing",
    });

    if (course.requirementType === "mandatory") {
      eval_.mandatoryRequiredCourses++;
      eval_.mandatoryRequiredCredits += course.credits;
      if (registered) {
        eval_.mandatoryRegisteredCourses++;
        eval_.mandatoryRegisteredCredits += course.credits;
      } else {
        eval_.missingMandatoryCourses++;
      }
    } else if (course.requirementType === "elective") {
      if (course.choiceGroupCode) {
        const group = choiceGroups.get(course.choiceGroupCode) || [];
        group.push(course);
        choiceGroups.set(course.choiceGroupCode, group);
        continue; // choice groups handled below
      }
      if (course.isRegistrationRequired) {
        eval_.requiredElectiveCourses++;
        if (registered) {
          eval_.registeredRequiredElectiveCourses++;
        } else {
          eval_.missingRequiredElectiveCourses++;
        }
      }
      if (registered) {
        eval_.registeredElectiveCredits += course.credits;
      }
      eval_.requiredElectiveCredits += course.credits;
    }
  }

  // Choice group evaluation
  for (const [code, groupCourses] of choiceGroups) {
    const result: ChoiceGroupResult = {
      code,
      requiredCourses: 1,
      registeredCourses: 0,
      requiredCredits: groupCourses[0].credits,
      registeredCredits: 0,
      selectedCourseIDs: [],
      status: "pass",
    };
    for (const course of groupCourses) {
      if (byCourse.has(course.courseId)) {
        result.registeredCourses++;
        result.registeredCredits += course.credits;
        result.selectedCourseIDs.push(course.courseCode);
      }
    }
    if (result.registeredCourses === 0) {
      result.status = "missing";
    } else if (result.registeredCourses > 1) {
      result.status = "over_registered";
    }
    if (result.status !== "pass") {
      eval_.status = "fail";
    }
    eval_.choiceGroupResults.push(result);
  }
  eval_.choiceGroupResults.sort((a, b) => a.code.localeCompare(b.code));

  // Outside-plan courses
  const outsideCourseIds = new Set<string>();
  for (const r of registrations) {
    if (!planCourseIds.has(r.courseId) && !outsideCourseIds.has(r.courseId)) {
      outsideCourseIds.add(r.courseId);
      eval_.outsidePlanCourses++;
      eval_.outsidePlanCredits += r.credits;
      eval_.courses.push({
        courseId: r.courseId,
        courseCode: r.courseCode,
        courseName: r.courseName,
        credits: r.credits,
        group: "outside_plan",
        choiceGroupCode: "",
        isRegistrationRequired: false,
        registrationStatus: "registered",
      });
    }
  }

  if (dataError) {
    eval_.status = "data_error";
  } else if (eval_.missingMandatoryCourses > 0 || eval_.missingRequiredElectiveCourses > 0) {
    eval_.status = "fail";
  }

  return eval_;
}

export function applyElectiveThreshold(eval_: ProgressEvaluation, required: number): void {
  eval_.requiredElectiveCredits = required;
  eval_.missingCredits = Math.max(0, required - eval_.registeredElectiveCredits);
  if (eval_.status !== "data_error" && eval_.registeredElectiveCredits < required) {
    eval_.status = "fail";
  }
}

export function termDue(plan: CompletionPlan, assessmentYear: string, assessmentOrder: number): boolean {
  if (plan.academicYearCode < assessmentYear) return true;
  if (plan.academicYearCode > assessmentYear) return false;
  return plan.termOrder <= assessmentOrder;
}

/**
 * evaluateCompletionPlan: Evaluates a student's evidence vs plan courses.
 * Ported from SWE completion.go L568–L668.
 */
export function evaluateCompletionPlan(
  plan: CompletionPlan,
  evidence: Map<string, PassingEvidence>,
  isDue: boolean,
  registrations: Set<string> = new Set(),
  pendingEligible = false,
  forecast = false,
): CompletionPlanResult {
  const result: CompletionPlanResult = {
    planId: plan.id,
    planVersion: plan.version,
    academicTermId: plan.academicTermId,
    curriculumSemesterNo: plan.curriculumSemesterNo,
    isDue,
    isPass: true,
    missingMandatoryCourses: 0,
    missingRequiredElectives: 0,
    requiredElectiveCredits: plan.requiredElective,
    passedElectiveCredits: 0,
    missingElectiveCredits: 0,
    pendingResultCourses: 0,
    pendingOnly: false,
    choiceGroups: [],
    courses: [],
  };

  const groups = new Map<string, PlanCourse[]>();
  let pendingOnly = isDue;

  for (const course of plan.courses) {
    const courseEvidence = evidence.get(course.courseId) || null;
    const passed = Boolean(courseEvidence);
    const pendingResult = pendingEligible && !passed && registrations.has(course.courseId);
    const assumedPassed = passed || (forecast && pendingResult);
    result.courses.push({ ...course, passed: assumedPassed, pendingResult, evidence: courseEvidence });
    if (pendingResult) result.pendingResultCourses++;

    if (course.choiceGroupCode) {
      const g = groups.get(course.choiceGroupCode) || [];
      g.push(course);
      groups.set(course.choiceGroupCode, g);
      continue;
    }

    if (course.requirementType === "mandatory" && !assumedPassed) {
      result.missingMandatoryCourses++;
    }
    if (course.requirementType === "elective") {
      if (course.isRegistrationRequired && !assumedPassed) {
        result.missingRequiredElectives++;
      }
      if (assumedPassed) {
        result.passedElectiveCredits += course.credits;
      }
    }
  }

  // Choice groups
  for (const [code, groupCourses] of groups) {
    const selected: string[] = [];
    let credits = 0;
    for (const course of groupCourses) {
      if (evidence.has(course.courseId) || (forecast && pendingEligible && registrations.has(course.courseId))) {
        selected.push(course.courseCode);
        credits += course.credits;
      }
    }
    result.passedElectiveCredits += credits;
    let status = "pass";
    if (selected.length === 0) {
      status = "missing";
      result.isPass = false;
      const pendingSelections = groupCourses.filter((course) => pendingEligible && registrations.has(course.courseId)).length;
      if (pendingSelections !== 1) pendingOnly = false;
    }
    if (selected.length > 1) {
      status = "over_registered";
      result.isPass = false;
      pendingOnly = false;
    }
    result.choiceGroups.push({
      code,
      requiredCourses: 1,
      registeredCourses: selected.length,
      requiredCredits: groupCourses[0].credits,
      registeredCredits: credits,
      selectedCourseIDs: selected,
      status,
    });
  }
  result.choiceGroups.sort((a, b) => a.code.localeCompare(b.code));

  if (result.passedElectiveCredits < result.requiredElectiveCredits) {
    result.missingElectiveCredits = result.requiredElectiveCredits - result.passedElectiveCredits;
  }

  if (
    result.missingMandatoryCourses > 0 ||
    result.missingRequiredElectives > 0 ||
    result.missingElectiveCredits > 0 ||
    plan.courses.length === 0
  ) {
    result.isPass = false;
  }

  if (!pendingEligible || !isDue || result.isPass) pendingOnly = false;
  for (const course of result.courses) {
    if (course.requirementType === "mandatory" && !course.passed && !course.pendingResult) pendingOnly = false;
    if (course.requirementType === "elective" && course.isRegistrationRequired && !course.passed && !course.pendingResult) {
      pendingOnly = false;
    }
  }
  const pendingElectiveCredits = result.courses
    .filter((course) => course.requirementType === "elective" && course.pendingResult)
    .reduce((sum, course) => sum + course.credits, 0);
  if (!forecast && result.passedElectiveCredits + pendingElectiveCredits < result.requiredElectiveCredits) {
    pendingOnly = false;
  }
  result.pendingOnly = pendingOnly;

  return result;
}

// ============================================================================
// DB Query Helpers
// ============================================================================

async function loadCalcStudents(programCode: string, cohortId: string): Promise<CalcStudent[]> {
  const rows: any[] = await prisma.$queryRaw`
    SELECT s.id::text, s.s_student_id, s.s_full_name,
           COALESCE(c.id::text,'') as class_uuid,
           COALESCE(c.class_id,'') as class_code,
           COALESCE(c.class_name,'') as class_name,
           COALESCE(c.cohort_id::text,'') as cohort_uuid,
           COALESCE(co.s_cohort_code,'') as cohort_code,
           COALESCE(s.s_study_program_id,'') as program_code
    FROM students s
    LEFT JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    LEFT JOIN cohorts co ON co.id = c.cohort_id AND co.deleted_at IS NULL
    WHERE s.s_study_program_id = ${programCode} AND s.deleted_at IS NULL
    ORDER BY s.s_student_id
  `;

  const students: CalcStudent[] = [];
  for (const r of rows) {
    if (r.class_uuid && r.cohort_uuid && r.cohort_uuid !== cohortId) {
      continue; // different cohort
    }
    students.push({
      id: r.id,
      studentCode: r.s_student_id,
      studentName: r.s_full_name,
      classId: r.class_uuid,
      classCode: r.class_code,
      className: r.class_name,
      cohortId: r.cohort_uuid,
      cohortCode: r.cohort_code,
      programCode: r.program_code,
      dataError: !r.class_uuid || !r.cohort_uuid || !r.program_code,
    });
  }
  return students;
}

async function loadCalcOfferings(
  academicYearId: string,
  academicTermId: string,
  allowedStudentIds: Set<string>,
): Promise<{ registrations: Map<string, RegistrationSnapshot[]>; sourceRows: any[]; offeringCount: number }> {
  const studentIds = [...allowedStudentIds];
  if (studentIds.length === 0) {
    return { registrations: new Map(), sourceRows: [], offeringCount: 0 };
  }
  const rows: any[] = await prisma.$queryRaw`
    SELECT o.id::text as offering_id, o.student_id::text, o.course_id::text,
           c.s_course_code, o.s_course_name, o.s_credits
    FROM student_course_offerings o
    JOIN courses c ON c.id = o.course_id
    WHERE o.academic_year_id = ${academicYearId}::uuid
      AND o.academic_term_id = ${academicTermId}::uuid
      AND o.student_id = ANY(${studentIds}::uuid[])
    ORDER BY o.student_id, o.course_id, o.id
  `;

  const registrations = new Map<string, RegistrationSnapshot[]>();
  const sourceRows: any[] = [];
  const seen = new Map<string, Set<string>>();

  for (const r of rows) {
    sourceRows.push(r);

    let byCourse = seen.get(r.student_id);
    if (!byCourse) {
      byCourse = new Set();
      seen.set(r.student_id, byCourse);
    }
    if (byCourse.has(r.course_id)) continue;
    byCourse.add(r.course_id);

    const arr = registrations.get(r.student_id) || [];
    arr.push({
      courseId: r.course_id,
      courseCode: r.s_course_code,
      courseName: r.s_course_name,
      credits: Number(r.s_credits),
    });
    registrations.set(r.student_id, arr);
  }

  return { registrations, sourceRows, offeringCount: sourceRows.length };
}

async function loadPassingEvidence(
  studentIds: string[],
  assessmentYear: string,
  assessmentOrder: number,
): Promise<Map<string, Map<string, PassingEvidence>>> {
  if (studentIds.length === 0) return new Map();

  const rows: any[] = await prisma.$queryRaw`
    SELECT o.student_id::text, o.course_id::text, o.id::text as offering_id,
           y.s_year_code, t.s_term_code, t.s_term_order, g.score_status
    FROM student_course_offerings o
    JOIN student_course_grades g ON g.offering_id = o.id
    JOIN academic_terms t ON t.id = o.academic_term_id
    JOIN academic_years y ON y.id = t.academic_year_id
    WHERE o.student_id = ANY(${studentIds}::uuid[])
      AND g.is_pass = true AND g.score_status = 'graded' AND g.not_score = false
      AND (y.s_year_code < ${assessmentYear} OR (y.s_year_code = ${assessmentYear} AND t.s_term_order <= ${assessmentOrder}))
    ORDER BY o.student_id, o.course_id, y.s_year_code DESC, t.s_term_order DESC, o.id DESC
  `;

  const evidence = new Map<string, Map<string, PassingEvidence>>();
  for (const r of rows) {
    let byCourse = evidence.get(r.student_id);
    if (!byCourse) {
      byCourse = new Map();
      evidence.set(r.student_id, byCourse);
    }
    if (byCourse.has(r.course_id)) continue; // take latest only
    byCourse.set(r.course_id, {
      offeringId: r.offering_id,
      studentId: r.student_id,
      courseId: r.course_id,
      academicYear: r.s_year_code,
      termCode: r.s_term_code,
      termOrder: Number(r.s_term_order),
      scoreStatus: r.score_status,
    });
  }
  return evidence;
}

async function loadCumulativeGPAs(
  studentIds: string[],
  assessmentYear: string,
  assessmentOrder: number,
): Promise<Map<string, { gpa10: number | null; gpa4: number | null; academicYear: string; termCode: string }>> {
  if (studentIds.length === 0) return new Map();

  const rows: any[] = await prisma.$queryRaw`
    SELECT s.student_id::text, s.cumulative_gpa_10, s.cumulative_gpa_4, y.s_year_code, t.s_term_code
    FROM student_term_summaries s
    JOIN academic_terms t ON t.id = s.academic_term_id
    JOIN academic_years y ON y.id = t.academic_year_id
    WHERE s.student_id = ANY(${studentIds}::uuid[])
      AND (y.s_year_code < ${assessmentYear} OR (y.s_year_code = ${assessmentYear} AND t.s_term_order <= ${assessmentOrder}))
    ORDER BY s.student_id, y.s_year_code DESC, t.s_term_order DESC, s.id DESC
  `;

  const result = new Map<string, { gpa10: number | null; gpa4: number | null; academicYear: string; termCode: string }>();
  for (const r of rows) {
    if (result.has(r.student_id)) continue; // take latest
    result.set(r.student_id, {
      gpa10: r.cumulative_gpa_10 != null ? Number(r.cumulative_gpa_10) : null,
      gpa4: r.cumulative_gpa_4 != null ? Number(r.cumulative_gpa_4) : null,
      academicYear: r.s_year_code,
      termCode: r.s_term_code,
    });
  }
  return result;
}

async function loadCurrentTermRegistrations(
  studentIds: string[],
  academicTermId: string,
): Promise<Map<string, Set<string>>> {
  if (studentIds.length === 0) return new Map();
  const rows: Array<{ student_id: string; course_id: string }> = await prisma.$queryRaw`
    SELECT DISTINCT student_id::text, course_id::text
    FROM student_course_offerings
    WHERE student_id = ANY(${studentIds}::uuid[])
      AND academic_term_id = ${academicTermId}::uuid
  `;
  const registrations = new Map<string, Set<string>>();
  for (const row of rows) {
    const courses = registrations.get(row.student_id) || new Set<string>();
    courses.add(row.course_id);
    registrations.set(row.student_id, courses);
  }
  return registrations;
}

async function loadCompletionPlans(cohortId: string, programId: string): Promise<CompletionPlan[]> {
  const rows: any[] = await prisma.$queryRaw`
    SELECT p.id::text, p.version, p.academic_term_id::text, y.s_year_code, t.s_term_order, t.s_term_code,
           p.curriculum_semester_no, p.required_elective_credits, p.status, p.is_current, p.is_program_final
    FROM training_progress_plans p
    JOIN academic_terms t ON t.id = p.academic_term_id AND t.deleted_at IS NULL
    JOIN academic_years y ON y.id = t.academic_year_id AND y.deleted_at IS NULL
    WHERE p.cohort_id = ${cohortId}::uuid
      AND p.training_program_id = ${programId}::uuid
      AND p.status = 'locked' AND p.is_current = true
    ORDER BY y.s_year_code, t.s_term_order, p.curriculum_semester_no, p.version
  `;

  if (rows.length === 0) return [];
  const planIds = rows.map((row) => row.id);
  const courseRows: any[] = await prisma.$queryRaw`
    SELECT plan_id::text, course_id::text, s_course_code, s_course_name, s_credits, requirement_type,
           COALESCE(choice_group_code,'') as choice_group_code, is_registration_required
    FROM training_progress_plan_courses
    WHERE plan_id = ANY(${planIds}::uuid[])
    ORDER BY plan_id, requirement_type, choice_group_code NULLS FIRST, s_course_code
  `;
  const coursesByPlan = new Map<string, PlanCourse[]>();
  for (const course of courseRows) {
    const courses = coursesByPlan.get(course.plan_id) || [];
    courses.push({
      courseId: course.course_id,
      courseCode: course.s_course_code,
      courseName: course.s_course_name,
      credits: Number(course.s_credits),
      requirementType: course.requirement_type,
      choiceGroupCode: course.choice_group_code || null,
      isRegistrationRequired: course.is_registration_required,
    });
    coursesByPlan.set(course.plan_id, courses);
  }

  const plans: CompletionPlan[] = [];
  for (const r of rows) {
    const plan: CompletionPlan = {
      id: r.id,
      version: Number(r.version),
      academicTermId: r.academic_term_id,
      academicYearCode: r.s_year_code,
      termOrder: Number(r.s_term_order),
      termCode: r.s_term_code,
      curriculumSemesterNo: Number(r.curriculum_semester_no),
      requiredElective: Number(r.required_elective_credits),
      status: r.status,
      isCurrent: r.is_current,
      isProgramFinal: r.is_program_final,
      courses: coursesByPlan.get(r.id) || [],
    };
    plans.push(plan);
  }
  return plans;
}

async function validateCompletionCoverage(programId: string, plans: CompletionPlan[]) {
  const maxSemester = plans.reduce((max, plan) => Math.max(max, plan.curriculumSemesterNo), 0);
  // Coverage is not applicable before the first plan becomes due. This is a
  // legitimate "no_due_plan" state, not corrupt curriculum data.
  if (!maxSemester) return { valid: true, issues: [] as string[] };
  const requirements = await prisma.trainingProgramCourse.findMany({
    where: { trainingProgramId: programId, sSemesterNo: { lte: maxSemester } },
  });
  const catalog = await prisma.course.findMany({
    where: { id: { in: requirements.map((requirement) => requirement.courseId) }, deletedAt: null },
  });
  const catalogById = new Map(catalog.map((course) => [course.id, course]));
  const requirementByCourse = new Map(requirements.map((requirement) => [requirement.courseId, requirement]));
  const counts = new Map<string, number>();
  const issues: string[] = [];
  for (const plan of plans) {
    let electiveCredits = 0;
    for (const course of plan.courses) {
      counts.set(course.courseId, (counts.get(course.courseId) || 0) + 1);
      const expected = requirementByCourse.get(course.courseId);
      if (!expected) {
        issues.push(`Học phần không thuộc CTĐT nhưng có trong kế hoạch: ${course.courseCode}`);
        continue;
      }
      const normalized = expected.sRequirementType.toLocaleLowerCase("vi");
      const expectedType = normalized.includes("bắt") || normalized === "mandatory" ? "mandatory" : "elective";
      if (expectedType !== course.requirementType) issues.push(`Loại yêu cầu của học phần chưa khớp CTĐT: ${course.courseCode}`);
      if (course.requirementType === "elective") electiveCredits += course.credits;
    }
    if (electiveCredits < plan.requiredElective) {
      issues.push(`Học kỳ lộ trình ${plan.curriculumSemesterNo} chưa đủ tín chỉ tự chọn: ${electiveCredits}/${plan.requiredElective}`);
    }
  }
  for (const requirement of requirements) {
    const course = catalogById.get(requirement.courseId);
    const normalized = requirement.sRequirementType.toLocaleLowerCase("vi");
    const mandatory = normalized.includes("bắt") || normalized === "mandatory";
    const count = counts.get(requirement.courseId) || 0;
    if (mandatory && count === 0) issues.push(`Học phần bắt buộc chưa có trong kế hoạch: ${course?.sCourseCode || requirement.courseId}`);
    if (count > 1) issues.push(`Học phần xuất hiện trong nhiều kế hoạch: ${course?.sCourseCode || requirement.courseId}`);
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}

// ============================================================================
// Service Class
// ============================================================================

export class TrainingProgressService {
  static async scopeCompletionRunItems<TRun extends {
    id: string;
    totalStudents: number;
    completedStudents: number;
    incompleteStudents: number;
    cannotDetermineStudents: number;
    onTrackStudents: number;
    behindScheduleStudents: number;
    pendingResultStudents: number;
    noDuePlanStudents: number;
    dataErrorStudents: number;
  }>(items: TRun[], classScopes: Map<string, string[] | null>) {
    const restricted = items.filter((item) => classScopes.get(item.id) !== null);
    if (!restricted.length) return items;
    const results = await prisma.trainingProgressCompletionStudentResult.findMany({
      where: { runId: { in: restricted.map((item) => item.id) } },
      select: { runId: true, classId: true, programCompletionStatus: true, scheduleStatus: true, dataErrorReason: true },
    });
    return items.map((item) => {
      const scope = classScopes.get(item.id);
      if (scope === null) return item;
      const allowed = new Set(scope || []);
      const scoped = results.filter((result) => result.runId === item.id && result.classId && allowed.has(result.classId));
      return {
        ...item,
        totalStudents: scoped.length,
        completedStudents: scoped.filter((result) => result.programCompletionStatus === "completed").length,
        incompleteStudents: scoped.filter((result) => result.programCompletionStatus === "incomplete").length,
        cannotDetermineStudents: scoped.filter((result) => result.programCompletionStatus === "cannot_determine").length,
        onTrackStudents: scoped.filter((result) => result.scheduleStatus === "on_track").length,
        behindScheduleStudents: scoped.filter((result) => result.scheduleStatus === "behind_schedule").length,
        pendingResultStudents: scoped.filter((result) => result.scheduleStatus === "pending_result").length,
        noDuePlanStudents: scoped.filter((result) => result.scheduleStatus === "no_due_plan").length,
        dataErrorStudents: scoped.filter((result) => Boolean(result.dataErrorReason)).length,
      };
    });
  }

  // ===================== Plan CRUD =====================

  static async listPlans(
    cohortId?: string,
    trainingProgramId?: string,
    termId?: string,
    activeOnly?: boolean,
    page = 1,
    pageSize = 20,
    scope: Prisma.TrainingProgressPlanWhereInput = {},
  ) {
    const where: Prisma.TrainingProgressPlanWhereInput = { AND: [scope] };
    if (cohortId) where.cohortId = cohortId;
    if (trainingProgramId) where.trainingProgramId = trainingProgramId;
    if (termId) where.academicTermId = termId;
    if (activeOnly) {
      where.status = "locked";
      where.isCurrent = true;
    }

    const [total, plans] = await Promise.all([
      prisma.trainingProgressPlan.count({ where }),
      prisma.trainingProgressPlan.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const cohortIds = [...new Set(plans.map((p) => p.cohortId))];
    const termIds = [...new Set(plans.map((p) => p.academicTermId))];
    const programIds = [...new Set(plans.map((p) => p.trainingProgramId))];

    const [cohorts, terms, programs] = await Promise.all([
      prisma.cohort.findMany({ where: { id: { in: cohortIds } } }),
      prisma.academicTerm.findMany({ where: { id: { in: termIds } } }),
      prisma.trainingProgram.findMany({ where: { id: { in: programIds } } }),
    ]);

    const cohortMap = Object.fromEntries(cohorts.map((c) => [c.id, c]));
    const termMap = Object.fromEntries(terms.map((t) => [t.id, t]));
    const programMap = Object.fromEntries(programs.map((p) => [p.id, p]));

    // Count runs per plan
    const planIds = plans.map((p) => p.id);
    const runCounts: any[] = planIds.length > 0 ? await prisma.$queryRaw`
      SELECT plan_id::text, count(*)::int as run_count
      FROM training_progress_calculation_runs
      WHERE plan_id = ANY(${planIds}::uuid[])
      GROUP BY plan_id
    ` : [];
    const runCountMap = Object.fromEntries(runCounts.map((r: any) => [r.plan_id, Number(r.run_count)]));

    return {
      items: plans.map((p) => ({
        id: p.id,
        cohortId: p.cohortId,
        cohortCode: cohortMap[p.cohortId]?.sCohortCode,
        trainingProgramId: p.trainingProgramId,
        programCode: programMap[p.trainingProgramId]?.sProgramCode,
        academicTermId: p.academicTermId,
        termCode: termMap[p.academicTermId]?.sTermCode,
        curriculumSemesterNo: p.curriculumSemesterNo,
        version: p.version,
        status: p.status,
        isCurrent: p.isCurrent,
        isProgramFinal: p.is_program_final,
        requiredElectiveCredits: p.requiredElectiveCredits,
        runCount: runCountMap[p.id] || 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getPlanById(id: string, allowedClassIds?: string[] | null) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!plan) return null;

    const [cohort, term, program, planCourses, recentRuns] = await Promise.all([
      prisma.cohort.findUnique({ where: { id: plan.cohortId } }),
      prisma.academicTerm.findUnique({ where: { id: plan.academicTermId } }),
      prisma.trainingProgram.findUnique({ where: { id: plan.trainingProgramId } }),
      prisma.trainingProgressPlanCourse.findMany({ where: { planId: plan.id }, orderBy: [{ requirementType: "asc" }, { sCourseCode: "asc" }] }),
      prisma.trainingProgressCalculationRun.findMany({ where: { planId: plan.id }, orderBy: { startedAt: "desc" }, take: 5 }),
    ]);

    const recentRunCounts = allowedClassIds !== undefined && allowedClassIds !== null
      ? new Map((await Promise.all(recentRuns.map(async (run) => {
          const results = await prisma.trainingProgressStudentResult.findMany({
            where: { runId: run.id, classId: { in: allowedClassIds } },
            select: { status: true },
          });
          return [run.id, results] as const;
        }))))
      : null;
    return {
      id: plan.id,
      cohortId: plan.cohortId,
      cohortCode: cohort?.sCohortCode,
      trainingProgramId: plan.trainingProgramId,
      programCode: program?.sProgramCode,
      academicYearId: plan.academicYearId,
      academicTermId: plan.academicTermId,
      termCode: term?.sTermCode,
      curriculumSemesterNo: plan.curriculumSemesterNo,
      version: plan.version,
      status: plan.status,
      isCurrent: plan.isCurrent,
      isProgramFinal: plan.is_program_final,
      requiredElectiveCredits: plan.requiredElectiveCredits,
      courses: planCourses.map((pc) => ({
        id: pc.id,
        courseId: pc.courseId,
        courseCode: pc.sCourseCode,
        courseName: pc.sCourseName,
        credits: pc.sCredits,
        requirementType: pc.requirementType,
        choiceGroupCode: pc.choiceGroupCode,
        isRegistrationRequired: pc.isRegistrationRequired,
      })),
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        totalStudents: recentRunCounts?.get(r.id)?.length ?? r.totalStudents,
        passStudents: recentRunCounts?.get(r.id)?.filter((item) => item.status === "pass").length ?? r.passStudents,
        failStudents: recentRunCounts?.get(r.id)?.filter((item) => item.status === "fail").length ?? r.failStudents,
        dataErrorStudents: recentRunCounts?.get(r.id)?.filter((item) => item.status === "data_error").length ?? r.dataErrorStudents,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      })),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  static async createPlan(data: {
    cohortId: string;
    trainingProgramId?: string;
    academicTermId: string;
    curriculumSemesterNo: number;
    requiredElectiveCredits?: number;
    isProgramFinal?: boolean;
    courseIds?: { courseId: string; courseCode?: string; courseName?: string; requirementType?: string; credits?: number; choiceGroupCode?: string; isRegistrationRequired?: boolean }[];
  }) {
    const plan = await prisma.$transaction(async (tx) => {
      const term = await tx.academicTerm.findUnique({ where: { id: data.academicTermId } });
      if (!term) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
      if (term.sIsSummer) {
        throw new ApiError(
          "Không tạo kế hoạch đào tạo riêng cho học kỳ hè. Hãy giữ học phần ở milestone gốc và dùng đợt đối chiếu sau hè.",
          "SUMMER_PLAN_NOT_ALLOWED",
          422,
        );
      }
      const program = data.trainingProgramId
        ? await tx.trainingProgram.findUnique({ where: { id: data.trainingProgramId } })
        : await tx.trainingProgram.findFirst({ where: { deletedAt: null, isActive: true }, orderBy: { sProgramCode: "asc" } });
      if (!program) throw new ApiError("Training program not found", "NOT_FOUND", 404);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${data.cohortId}:${program.id}:${data.academicTermId}`}))`;
      const latest = await tx.trainingProgressPlan.findFirst({
        where: { cohortId: data.cohortId, trainingProgramId: program.id, academicTermId: data.academicTermId },
        orderBy: { version: "desc" },
      });
      const created = await tx.trainingProgressPlan.create({
        data: {
          cohortId: data.cohortId,
          trainingProgramId: program.id,
          academicYearId: term.academicYearId,
          academicTermId: data.academicTermId,
          curriculumSemesterNo: data.curriculumSemesterNo,
          requiredElectiveCredits: data.requiredElectiveCredits ?? 0,
          is_program_final: data.isProgramFinal ?? false,
          version: (latest?.version || 0) + 1,
          status: "draft",
        },
      });
      if (data.courseIds?.length) {
        await tx.trainingProgressPlanCourse.createMany({
          data: data.courseIds.map((course) => ({
            planId: created.id,
            courseId: course.courseId,
            sCourseCode: course.courseCode || "",
            sCourseName: course.courseName || "",
            sCredits: course.credits ?? 3,
            requirementType: course.requirementType || "mandatory",
            choiceGroupCode: course.choiceGroupCode || null,
            isRegistrationRequired: course.isRegistrationRequired ?? (course.requirementType === "mandatory"),
          })),
        });
      }
      return created;
    });
    return this.getPlanById(plan.id);
  }

  static async previewPlanClone(data: {
    sourceTrainingProgramId: string;
    targetTrainingProgramId: string;
    cohortId: string;
  }) {
    if (!data.sourceTrainingProgramId || !data.targetTrainingProgramId || !data.cohortId || data.sourceTrainingProgramId === data.targetTrainingProgramId) {
      throw new ApiError("Source, target and cohort must be valid and distinct", "PLAN_INVALID", 422);
    }
    const [cohort, sourceProgram, targetProgram] = await Promise.all([
      prisma.cohort.findFirst({ where: { id: data.cohortId, deletedAt: null } }),
      prisma.trainingProgram.findFirst({ where: { id: data.sourceTrainingProgramId, deletedAt: null } }),
      prisma.trainingProgram.findFirst({ where: { id: data.targetTrainingProgramId, deletedAt: null } }),
    ]);
    if (!cohort || !sourceProgram || !targetProgram) throw new ApiError("Clone scope not found", "PLAN_INVALID", 422);

    const sourceCandidates = await prisma.trainingProgressPlan.findMany({
      where: { cohortId: data.cohortId, trainingProgramId: data.sourceTrainingProgramId, status: { not: "archived" } },
      orderBy: { version: "desc" },
    });
    const selected = new Map<string, (typeof sourceCandidates)[number]>();
    for (const plan of sourceCandidates) {
      const key = `${plan.academicTermId}:${plan.curriculumSemesterNo}`;
      if (!selected.has(key)) selected.set(key, plan);
    }
    const sourcePlans = [...selected.values()];
    if (!sourcePlans.length) throw new ApiError("No source plans found", "PLAN_INVALID", 422);

    const [sourceCourses, targetProgramCourses, catalog, terms, years] = await Promise.all([
      prisma.trainingProgressPlanCourse.findMany({ where: { planId: { in: sourcePlans.map((plan) => plan.id) } } }),
      prisma.trainingProgramCourse.findMany({ where: { trainingProgramId: data.targetTrainingProgramId } }),
      prisma.course.findMany({ where: { deletedAt: null } }),
      prisma.academicTerm.findMany({ where: { id: { in: sourcePlans.map((plan) => plan.academicTermId) } } }),
      prisma.academicYear.findMany({ where: { id: { in: sourcePlans.map((plan) => plan.academicYearId) } } }),
    ]);
    const catalogById = new Map(catalog.map((course) => [course.id, course]));
    const targetBySemesterAndCode = new Map<string, (typeof targetProgramCourses)[number]>();
    for (const item of targetProgramCourses) {
      const course = catalogById.get(item.courseId);
      if (course) targetBySemesterAndCode.set(`${item.sSemesterNo}:${course.sCourseCode}`, item);
    }
    const sourceByPlan = new Map<string, typeof sourceCourses>();
    for (const course of sourceCourses) {
      const items = sourceByPlan.get(course.planId) || [];
      items.push(course);
      sourceByPlan.set(course.planId, items);
    }
    const termById = new Map(terms.map((term) => [term.id, term]));
    const yearById = new Map(years.map((year) => [year.id, year]));
    const items = sourcePlans.map((plan) => {
      const issues: Array<{ code: string; message: string }> = [];
      const courses = sourceByPlan.get(plan.id) || [];
      for (const course of courses) {
        const target = targetBySemesterAndCode.get(`${plan.curriculumSemesterNo}:${course.sCourseCode}`);
        if (!target) issues.push({ code: "COURSE_MISSING", message: `CTĐT đích thiếu học phần ${course.sCourseCode}` });
        else if (target.sCredits !== course.sCredits) issues.push({ code: "CREDITS_MISMATCH", message: `Học phần ${course.sCourseCode} có số tín chỉ khác` });
      }
      const term = termById.get(plan.academicTermId);
      return {
        sourcePlanId: plan.id,
        curriculumSemesterNo: plan.curriculumSemesterNo,
        academicYearCode: yearById.get(plan.academicYearId)?.sYearCode || "",
        termCode: term?.sTermCode || "",
        courseCount: courses.length,
        issues,
      };
    });
    return { ...data, canClone: items.every((item) => item.issues.length === 0), items };
  }

  static async clonePlans(data: {
    sourceTrainingProgramId: string;
    targetTrainingProgramId: string;
    cohortId: string;
  }) {
    const preview = await this.previewPlanClone(data);
    if (!preview.canClone) throw new ApiError("Clone preview contains blocking issues", "PLAN_INVALID", 422);
    const sourcePlans = await prisma.trainingProgressPlan.findMany({
      where: { id: { in: preview.items.map((item) => item.sourcePlanId) } },
    });
    const sourceCourses = await prisma.trainingProgressPlanCourse.findMany({
      where: { planId: { in: sourcePlans.map((plan) => plan.id) } },
    });
    const targetProgramCourses = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: data.targetTrainingProgramId },
    });
    const catalog = await prisma.course.findMany({
      where: { id: { in: targetProgramCourses.map((item) => item.courseId) }, deletedAt: null },
    });
    const catalogById = new Map(catalog.map((course) => [course.id, course]));
    const targetBySemesterAndCode = new Map<string, { item: (typeof targetProgramCourses)[number]; name: string }>();
    for (const item of targetProgramCourses) {
      const course = catalogById.get(item.courseId);
      if (course) targetBySemesterAndCode.set(`${item.sSemesterNo}:${course.sCourseCode}`, { item, name: course.sCourseName });
    }
    const sourceByPlan = new Map<string, typeof sourceCourses>();
    for (const course of sourceCourses) {
      const items = sourceByPlan.get(course.planId) || [];
      items.push(course);
      sourceByPlan.set(course.planId, items);
    }
    const cloneBatchId = crypto.randomUUID();
    const createdIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const source of sourcePlans) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${data.cohortId}:${data.targetTrainingProgramId}:${source.academicTermId}`}))`;
        const latest = await tx.trainingProgressPlan.findFirst({
          where: { cohortId: data.cohortId, trainingProgramId: data.targetTrainingProgramId, academicTermId: source.academicTermId },
          orderBy: { version: "desc" },
        });
        const created = await tx.trainingProgressPlan.create({
          data: {
            cohortId: data.cohortId,
            trainingProgramId: data.targetTrainingProgramId,
            academicYearId: source.academicYearId,
            academicTermId: source.academicTermId,
            curriculumSemesterNo: source.curriculumSemesterNo,
            version: (latest?.version || 0) + 1,
            status: "draft",
            requiredElectiveCredits: source.requiredElectiveCredits,
            cloneBatchId,
            clonedFromPlanId: source.id,
            clonedFromProgramId: data.sourceTrainingProgramId,
          },
        });
        const courses = (sourceByPlan.get(source.id) || []).map((course) => {
          const target = targetBySemesterAndCode.get(`${source.curriculumSemesterNo}:${course.sCourseCode}`);
          if (!target) throw new ApiError(`Target course missing: ${course.sCourseCode}`, "PLAN_INVALID", 422);
          return {
            planId: created.id,
            courseId: target.item.courseId,
            sCourseCode: course.sCourseCode,
            sCourseName: target.name,
            sCredits: target.item.sCredits,
            requirementType: course.requirementType,
            choiceGroupCode: course.choiceGroupCode,
            isRegistrationRequired: course.isRegistrationRequired,
          };
        });
        if (courses.length) await tx.trainingProgressPlanCourse.createMany({ data: courses });
        ids.push(created.id);
      }
      return ids;
    });
    const plans = await Promise.all(createdIds.map((id) => this.getPlanById(id)));
    return { cloneBatchId, plans };
  }

  static async createPlanVersion(id: string) {
    const source = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!source) throw new ApiError("Plan not found", "NOT_FOUND", 404);
    const courses = await prisma.trainingProgressPlanCourse.findMany({ where: { planId: id } });
    return this.createPlan({
      cohortId: source.cohortId,
      trainingProgramId: source.trainingProgramId,
      academicTermId: source.academicTermId,
      curriculumSemesterNo: source.curriculumSemesterNo,
      requiredElectiveCredits: source.requiredElectiveCredits,
      isProgramFinal: source.is_program_final,
      courseIds: courses.map((course) => ({
        courseId: course.courseId,
        courseCode: course.sCourseCode,
        courseName: course.sCourseName,
        requirementType: course.requirementType,
        credits: course.sCredits,
        choiceGroupCode: course.choiceGroupCode || undefined,
        isRegistrationRequired: course.isRegistrationRequired,
      })),
    });
  }

  static async updatePlan(
    id: string,
    data: {
      curriculumSemesterNo?: number;
      requiredElectiveCredits?: number;
      isProgramFinal?: boolean;
      courseIds?: { courseId: string; courseCode?: string; courseName?: string; requirementType?: string; credits?: number; choiceGroupCode?: string; isRegistrationRequired?: boolean }[];
    },
  ) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "draft") throw new Error("Only draft plans can be updated");

    await prisma.$transaction(async (tx) => {
      const updated = await tx.trainingProgressPlan.updateMany({
        where: { id, status: "draft" },
        data: {
          curriculumSemesterNo: data.curriculumSemesterNo ?? plan.curriculumSemesterNo,
          requiredElectiveCredits: data.requiredElectiveCredits ?? plan.requiredElectiveCredits,
          is_program_final: data.isProgramFinal ?? plan.is_program_final,
          updatedAt: new Date(),
        },
      });
      if (!updated.count) throw new ApiError("Draft plan not found", "NOT_FOUND", 404);
      if (data.courseIds) {
        await tx.trainingProgressPlanCourse.deleteMany({ where: { planId: id } });
        if (data.courseIds.length > 0) await tx.trainingProgressPlanCourse.createMany({
          data: data.courseIds.map((c) => ({
            planId: id,
            courseId: c.courseId,
            sCourseCode: c.courseCode || "",
            sCourseName: c.courseName || "",
            sCredits: c.credits ?? 3,
            requirementType: c.requirementType || "mandatory",
            choiceGroupCode: c.choiceGroupCode || null,
            isRegistrationRequired: c.isRegistrationRequired ?? (c.requirementType === "mandatory"),
          })),
        });
      }
    });

    return this.getPlanById(id);
  }

  // ===================== Plan Lifecycle =====================

  static async lockPlan(id: string) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "draft") throw new Error("Only draft plans can be locked");

    const updated = await prisma.trainingProgressPlan.updateMany({
      where: { id, status: "draft" },
      data: { status: "locked", updatedAt: new Date() },
    });
    if (!updated.count) throw new ApiError("Draft plan not found", "NOT_FOUND", 404);
    return this.getPlanById(id);
  }

  static async activatePlan(id: string) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "locked") throw new Error("Only locked plans can be activated");

    await prisma.$transaction(async (tx) => {
      await tx.trainingProgressPlan.updateMany({
        where: {
          cohortId: plan.cohortId,
          trainingProgramId: plan.trainingProgramId,
          academicTermId: plan.academicTermId,
          id: { not: id },
          isCurrent: true,
        },
        data: { isCurrent: false, status: "archived", updatedAt: new Date() },
      });
      if (plan.is_program_final) {
        await tx.trainingProgressPlan.updateMany({
          where: { cohortId: plan.cohortId, trainingProgramId: plan.trainingProgramId, id: { not: id }, isCurrent: true },
          data: { is_program_final: false, updatedAt: new Date() },
        });
      }
      const activated = await tx.trainingProgressPlan.updateMany({
        where: { id, status: "locked" },
        data: { isCurrent: true, status: "locked", updatedAt: new Date() },
      });
      if (!activated.count) throw new ApiError("Locked plan not found", "NOT_FOUND", 404);
    });
    return this.getPlanById(id);
  }

  static async archivePlan(id: string) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id } });
    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "draft" && plan.status !== "locked") {
      throw new Error("Only draft or locked plans can be archived");
    }

    await prisma.trainingProgressPlan.update({
      where: { id },
      data: { status: "archived", isCurrent: false, is_program_final: false, updatedAt: new Date() },
    });
    return this.getPlanById(id);
  }

  // ===================== REAL Calculation Engine =====================

  static async triggerCalculate(planId: string) {
    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "locked") throw new Error("Only locked plans can be calculated");

    // Load plan courses
    const planCourses = await prisma.trainingProgressPlanCourse.findMany({
      where: { planId: plan.id },
    });
    const courses: PlanCourse[] = planCourses.map((pc) => ({
      courseId: pc.courseId,
      courseCode: pc.sCourseCode,
      courseName: pc.sCourseName,
      credits: pc.sCredits,
      requirementType: pc.requirementType,
      choiceGroupCode: pc.choiceGroupCode,
      isRegistrationRequired: pc.isRegistrationRequired,
    }));

    // Get program code for loading students
    const program = await prisma.trainingProgram.findUnique({ where: { id: plan.trainingProgramId } });
    if (!program) throw new Error("Training program not found");

    // Load students
    const students = await loadCalcStudents(program.sProgramCode, plan.cohortId);
    const allowedStudentIds = new Set(students.map((s) => s.id));

    // Load offerings (registrations) for this year/term
    const { registrations, sourceRows, offeringCount } = await loadCalcOfferings(
      plan.academicYearId,
      plan.academicTermId,
      allowedStudentIds,
    );

    // Create snapshot hash
    const snapshotJSON = JSON.stringify(sourceRows);
    const snapshotHash = crypto.createHash("sha256").update(snapshotJSON).digest("hex");
    const capturedAt = new Date();

    const run = await prisma.trainingProgressCalculationRun.create({
      data: {
        planId: plan.id,
        planVersion: plan.version,
        status: "running",
        totalStudents: 0,
        passStudents: 0,
        failStudents: 0,
        dataErrorStudents: 0,
        startedAt: new Date(),
        sourceSnapshot: sourceRows as Prisma.InputJsonValue,
        sourceSnapshotHash: snapshotHash,
        sourceCapturedAt: capturedAt,
        offeringCount,
      },
    });

    let pass = 0, fail = 0, dataErrors = 0;
    const studentResults: Prisma.TrainingProgressStudentResultCreateManyInput[] = [];
    const courseResults: Prisma.TrainingProgressCourseResultCreateManyInput[] = [];
    const classGroups = new Map<string, {
      code: string;
      name: string;
      total: number;
      pass: number;
      fail: number;
      dataError: number;
      missingCredits: number;
    }>();

    for (const student of students) {
      const studentRegistrations = registrations.get(student.id) || [];
      const evaluation = evaluateProgress(courses, studentRegistrations, student.dataError);
      applyElectiveThreshold(evaluation, plan.requiredElectiveCredits);

      if (evaluation.status === "pass") pass++;
      else if (evaluation.status === "data_error") dataErrors++;
      else fail++;

      const resultId = crypto.randomUUID();
      studentResults.push({
        id: resultId,
        runId: run.id,
        studentId: student.id,
        classId: student.classId || null,
        cohortId: student.cohortId || null,
        sStudentId: student.studentCode,
        sStudentName: student.studentName,
        sClassStudentId: student.classCode || null,
        sClassName: student.className || null,
        sProgramCode: student.programCode || null,
        mandatoryRequiredCourses: evaluation.mandatoryRequiredCourses,
        mandatoryRegisteredCourses: evaluation.mandatoryRegisteredCourses,
        mandatoryRequiredCredits: evaluation.mandatoryRequiredCredits,
        mandatoryRegisteredCredits: evaluation.mandatoryRegisteredCredits,
        missingMandatoryCourses: evaluation.missingMandatoryCourses,
        requiredElectiveCourses: evaluation.requiredElectiveCourses,
        registeredRequiredElectiveCourses: evaluation.registeredRequiredElectiveCourses,
        missingRequiredElectiveCourses: evaluation.missingRequiredElectiveCourses,
        requiredElectiveCredits: evaluation.requiredElectiveCredits,
        registeredElectiveCredits: evaluation.registeredElectiveCredits,
        missingCredits: evaluation.missingCredits,
        outsidePlanCourses: evaluation.outsidePlanCourses,
        outsidePlanCredits: evaluation.outsidePlanCredits,
        choiceGroupResults: evaluation.choiceGroupResults as unknown as Prisma.InputJsonValue,
        status: evaluation.status,
      });

      for (const course of evaluation.courses) {
        courseResults.push({
          studentResultId: resultId,
          courseId: course.courseId || null,
          sCourseCode: course.courseCode,
          sCourseName: course.courseName,
          sCredits: course.credits,
          resultGroup: course.group,
          choiceGroupCode: course.choiceGroupCode || null,
          isRegistrationRequired: course.isRegistrationRequired,
          registrationStatus: course.registrationStatus,
        });
      }

      if (student.classId) {
        const group = classGroups.get(student.classId) || {
          code: student.classCode,
          name: student.className,
          total: 0,
          pass: 0,
          fail: 0,
          dataError: 0,
          missingCredits: 0,
        };
        group.total++;
        if (evaluation.status === "pass") group.pass++;
        else if (evaluation.status === "data_error") group.dataError++;
        else group.fail++;
        group.missingCredits += evaluation.missingCredits;
        classGroups.set(student.classId, group);
      }
    }

    const cohort = await prisma.cohort.findUnique({ where: { id: plan.cohortId } });
    const groupResults: Prisma.TrainingProgressGroupResultCreateManyInput[] = [
      ...[...classGroups.entries()].map(([groupId, group]) => ({
        runId: run.id,
        groupType: "class",
        groupId,
        groupCode: group.code,
        groupName: group.name || null,
        totalStudents: group.total,
        passStudents: group.pass,
        failStudents: group.fail,
        dataErrorStudents: group.dataError,
        totalMissingCredits: group.missingCredits,
      })),
      {
        runId: run.id,
        groupType: "cohort",
        groupId: plan.cohortId,
        groupCode: cohort?.sCohortCode || "",
        totalStudents: students.length,
        passStudents: pass,
        failStudents: fail,
        dataErrorStudents: dataErrors,
        totalMissingCredits: studentResults.reduce((sum, result) => sum + (result.missingCredits || 0), 0),
      },
    ];

    try {
      return await prisma.$transaction(async (tx) => {
        if (studentResults.length) await tx.trainingProgressStudentResult.createMany({ data: studentResults });
        if (courseResults.length) await tx.trainingProgressCourseResult.createMany({ data: courseResults });
        if (groupResults.length) await tx.trainingProgressGroupResult.createMany({ data: groupResults });
        return tx.trainingProgressCalculationRun.update({
          where: { id: run.id },
          data: {
            totalStudents: students.length,
            passStudents: pass,
            failStudents: fail,
            dataErrorStudents: dataErrors,
            status: "completed",
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await prisma.trainingProgressCalculationRun.update({
        where: { id: run.id },
        data: { status: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Calculation failed", completedAt: new Date() },
      });
      throw error;
    }
  }

  // ===================== Run Reports =====================

  static async getRunDetail(runId: string, allowedClassIds?: string[] | null) {
    const run = await prisma.trainingProgressCalculationRun.findUnique({ where: { id: runId } });
    if (!run) return null;

    const plan = await prisma.trainingProgressPlan.findUnique({ where: { id: run.planId } });

    const scopedResults = allowedClassIds !== undefined && allowedClassIds !== null
      ? await prisma.trainingProgressStudentResult.findMany({
          where: { runId, classId: { in: allowedClassIds } },
          select: { status: true },
        })
      : null;
    const scopedCount = (status: string) => scopedResults?.filter((result) => result.status === status).length;
    return {
      id: run.id,
      planId: run.planId,
      planVersion: run.planVersion,
      status: run.status,
      totalStudents: scopedResults?.length ?? run.totalStudents,
      passStudents: scopedCount("pass") ?? run.passStudents,
      failStudents: scopedCount("fail") ?? run.failStudents,
      dataErrorStudents: scopedCount("data_error") ?? run.dataErrorStudents,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      sourceSnapshotHash: run.sourceSnapshotHash,
      sourceCapturedAt: run.sourceCapturedAt,
      offeringCount: run.offeringCount,
      plan: plan ? {
        cohortId: plan.cohortId,
        termId: plan.academicTermId,
        curriculumSemesterNo: plan.curriculumSemesterNo,
        version: plan.version,
      } : null,
    };
  }

  static async getLatestRunForPlan(planId: string, allowedClassIds?: string[] | null) {
    const run = await prisma.trainingProgressCalculationRun.findFirst({
      where: { planId },
      orderBy: [{ startedAt: "desc" }],
    });
    if (!run) return null;
    return this.getRunDetail(run.id, allowedClassIds);
  }

  static async listStudentResults(
    runId: string,
    status?: string,
    classId?: string,
    page = 1,
    pageSize = 20,
    allowedClassIds?: string[] | null,
  ) {
    const where: any = { runId };
    if (status) where.status = status;
    if (allowedClassIds !== undefined && allowedClassIds !== null) where.classId = { in: allowedClassIds };
    if (classId) where.classId = allowedClassIds && !allowedClassIds.includes(classId) ? { in: [] } : classId;

    const [total, results] = await Promise.all([
      prisma.trainingProgressStudentResult.count({ where }),
      prisma.trainingProgressStudentResult.findMany({
        where,
        orderBy: { sStudentId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: results.map((r) => ({
        id: r.id,
        studentId: r.sStudentId,
        studentName: r.sStudentName,
        className: r.sClassStudentId,
        cohortCode: r.sProgramCode,
        mandatory: {
          requiredCourses: r.mandatoryRequiredCourses,
          registeredCourses: r.mandatoryRegisteredCourses,
          requiredCredits: r.mandatoryRequiredCredits,
          registeredCredits: r.mandatoryRegisteredCredits,
        },
        elective: {
          requiredCredits: r.requiredElectiveCredits,
          registeredCredits: r.registeredElectiveCredits,
          isEnough: r.registeredElectiveCredits >= r.requiredElectiveCredits,
        },
        requiredElectives: {
          requiredCourses: r.requiredElectiveCourses,
          registeredCourses: r.registeredRequiredElectiveCourses,
        },
        choiceGroups: r.choiceGroupResults as any,
        outsidePlanCredits: r.outsidePlanCredits,
        missingCredits: r.missingCredits,
        status: r.status,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async listClassResults(runId: string, page = 1, pageSize = 20, allowedClassIds?: string[] | null) {
    const where: Prisma.TrainingProgressGroupResultWhereInput = { runId, groupType: "class" };
    if (allowedClassIds !== undefined && allowedClassIds !== null) where.groupId = { in: allowedClassIds };
    const [total, results] = await Promise.all([
      prisma.trainingProgressGroupResult.count({ where }),
      prisma.trainingProgressGroupResult.findMany({
        where,
        orderBy: { groupCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: results.map((r) => ({
        groupType: r.groupType,
        groupId: r.groupId,
        groupCode: r.groupCode,
        groupName: r.groupName,
        totalStudents: r.totalStudents,
        passStudents: r.passStudents,
        failStudents: r.failStudents,
        dataErrorStudents: r.dataErrorStudents,
        totalMissingCredits: r.totalMissingCredits,
        calculatedAt: r.calculatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getCohortResult(runId: string) {
    const result = await prisma.trainingProgressGroupResult.findFirst({
      where: { runId, groupType: "cohort" },
    });
    if (!result) return null;
    return {
      groupType: result.groupType,
      groupId: result.groupId,
      groupCode: result.groupCode,
      totalStudents: result.totalStudents,
      passStudents: result.passStudents,
      failStudents: result.failStudents,
      dataErrorStudents: result.dataErrorStudents,
      totalMissingCredits: result.totalMissingCredits,
      calculatedAt: result.calculatedAt,
    };
  }

  // ===================== Student Registrations =====================

  static async listStudentRegistrations(
    studentId: string,
    page = 1,
    pageSize = 20,
    academicYear?: string,
    termCode?: string,
    courseCode?: string,
  ) {
    const student = await prisma.student.findFirst({
      where: { OR: [{ id: studentId }, { sStudentId: studentId }], deletedAt: null },
    });
    if (!student) return { items: [], total: 0, page, pageSize };

    const where: Prisma.StudentCourseOfferingWhereInput = { studentId: student.id };
    if (courseCode) where.sCurriculumId = { equals: courseCode, mode: "insensitive" };
    if (academicYear) {
      const year = await prisma.academicYear.findFirst({ where: { sYearCode: academicYear, deletedAt: null } });
      if (!year) return { items: [], total: 0, page, pageSize };
      where.academicYearId = year.id;
    }
    if (termCode) {
      const terms = await prisma.academicTerm.findMany({
        where: {
          sTermCode: termCode.toUpperCase(),
          deletedAt: null,
          ...(typeof where.academicYearId === "string" ? { academicYearId: where.academicYearId } : {}),
        },
        select: { id: true },
      });
      if (!terms.length) return { items: [], total: 0, page, pageSize };
      where.academicTermId = { in: terms.map((term) => term.id) };
    }

    const skip = (page - 1) * pageSize;
    const [total, items] = await Promise.all([
      prisma.studentCourseOffering.count({ where }),
      prisma.studentCourseOffering.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const termIds = [...new Set(items.map((item) => item.academicTermId))];
    const yearIds = [...new Set(items.map((item) => item.academicYearId))];
    const [terms, years] = await Promise.all([
      prisma.academicTerm.findMany({ where: { id: { in: termIds } } }),
      prisma.academicYear.findMany({ where: { id: { in: yearIds } } }),
    ]);
    const termMap = Object.fromEntries(terms.map((term) => [term.id, term]));
    const yearMap = Object.fromEntries(years.map((year) => [year.id, year]));

    return {
      items: items.map((r) => ({
        id: r.id,
        courseCode: r.sCurriculumId,
        courseName: r.sCourseName,
        credits: r.sCredits,
        academicYearId: r.academicYearId,
        academicTermId: r.academicTermId,
        academicYear: yearMap[r.academicYearId]?.sYearCode,
        termCode: termMap[r.academicTermId]?.sTermCode,
        termName: termMap[r.academicTermId]?.sTermName,
        isSummer: Boolean(termMap[r.academicTermId]?.sIsSummer),
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ===================== REAL Completion Engine =====================

  static async listCompletionRuns(
    cohortId?: string,
    programId?: string,
    termId?: string,
    publicationStatus?: string,
    evaluationMode?: string,
    page = 1,
    pageSize = 20,
    scope: Prisma.TrainingProgressCompletionRunWhereInput = {},
  ) {
    const where: Prisma.TrainingProgressCompletionRunWhereInput = { AND: [scope] };
    if (cohortId) where.cohortId = cohortId;
    if (programId) where.trainingProgramId = programId;
    if (termId) where.assessmentAcademicTermId = termId;
    if (publicationStatus) where.publicationStatus = publicationStatus;
    if (evaluationMode) where.evaluationMode = evaluationMode;

    const [total, runs] = await Promise.all([
      prisma.trainingProgressCompletionRun.count({ where }),
      prisma.trainingProgressCompletionRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: runs.map((r) => ({
        id: r.id,
        cohortId: r.cohortId,
        trainingProgramId: r.trainingProgramId,
        assessmentAcademicTermId: r.assessmentAcademicTermId,
        status: r.status,
        evaluationMode: r.evaluationMode,
        evaluationScope: r.evaluation_scope,
        publicationStatus: r.publicationStatus,
        totalStudents: r.totalStudents,
        completedStudents: r.completedStudents,
        incompleteStudents: r.incompleteStudents,
        cannotDetermineStudents: r.cannotDetermineStudents,
        onTrackStudents: r.onTrackStudents,
        behindScheduleStudents: r.behindScheduleStudents,
        pendingResultStudents: r.pendingResultStudents,
        noDuePlanStudents: r.noDuePlanStudents,
        dataErrorStudents: r.dataErrorStudents,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getCompletionRunDetail(runId: string, allowedClassIds?: string[] | null) {
    const run = await prisma.trainingProgressCompletionRun.findUnique({ where: { id: runId } });
    if (!run) return null;
    const scopedResults = allowedClassIds !== undefined && allowedClassIds !== null
      ? await prisma.trainingProgressCompletionStudentResult.findMany({
          where: { runId, classId: { in: allowedClassIds } },
          select: { programCompletionStatus: true, scheduleStatus: true, dataErrorReason: true },
        })
      : null;
    const programCount = (status: string) => scopedResults?.filter((result) => result.programCompletionStatus === status).length;
    const scheduleCount = (status: string) => scopedResults?.filter((result) => result.scheduleStatus === status).length;
    return {
      id: run.id,
      cohortId: run.cohortId,
      trainingProgramId: run.trainingProgramId,
      assessmentAcademicTermId: run.assessmentAcademicTermId,
      evaluationMode: run.evaluationMode,
      evaluationScope: run.evaluation_scope,
      publicationStatus: run.publicationStatus,
      sourceSnapshotHash: run.sourceSnapshotHash,
      status: run.status,
      totalStudents: scopedResults?.length ?? run.totalStudents,
      completedStudents: programCount("completed") ?? run.completedStudents,
      incompleteStudents: programCount("incomplete") ?? run.incompleteStudents,
      cannotDetermineStudents: programCount("cannot_determine") ?? run.cannotDetermineStudents,
      onTrackStudents: scheduleCount("on_track") ?? run.onTrackStudents,
      behindScheduleStudents: scheduleCount("behind_schedule") ?? run.behindScheduleStudents,
      pendingResultStudents: scheduleCount("pending_result") ?? run.pendingResultStudents,
      noDuePlanStudents: scheduleCount("no_due_plan") ?? run.noDuePlanStudents,
      dataErrorStudents: scopedResults?.filter((result) => Boolean(result.dataErrorReason)).length ?? run.dataErrorStudents,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  static async previewCompletionRun(data: {
    cohortId: string;
    trainingProgramId: string;
    assessmentAcademicTermId: string;
    evaluationMode?: string;
  }) {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string; details?: string[] }> = [];
    const [cohort, program, term] = await Promise.all([
      prisma.cohort.findFirst({ where: { id: data.cohortId, deletedAt: null } }),
      prisma.trainingProgram.findFirst({ where: { id: data.trainingProgramId, deletedAt: null } }),
      prisma.academicTerm.findFirst({ where: { id: data.assessmentAcademicTermId, deletedAt: null } }),
    ]);
    if (!cohort) blockers.push({ code: "COHORT_NOT_FOUND", message: "Khóa sinh viên không tồn tại hoặc đã bị xóa." });
    if (!program) blockers.push({ code: "TRAINING_PROGRAM_NOT_FOUND", message: "Chương trình đào tạo không tồn tại hoặc đã bị xóa." });
    if (!term) blockers.push({ code: "ASSESSMENT_TERM_NOT_FOUND", message: "Học kỳ đánh giá không tồn tại hoặc đã bị xóa." });
    if (!cohort || !program || !term) {
      return { valid: false, canRun: false, scope: null, summary: null, plans: [], blockers, warnings };
    }
    const year = await prisma.academicYear.findFirst({ where: { id: term.academicYearId, deletedAt: null } });
    if (!year) {
      blockers.push({ code: "ASSESSMENT_TERM_NOT_FOUND", message: "Năm học của học kỳ đánh giá không tồn tại." });
      return { valid: false, canRun: false, scope: null, summary: null, plans: [], blockers, warnings };
    }
    const plans = await loadCompletionPlans(data.cohortId, data.trainingProgramId);
    const duePlans = plans.filter((plan) => termDue(plan, year.sYearCode, term.sTermOrder));
    const maxSemester = duePlans.reduce((max, plan) => Math.max(max, plan.curriculumSemesterNo), 0);
    const finalPlans = plans.filter((plan) => plan.isProgramFinal);
    const maximumCurrentSemester = plans.reduce((max, plan) => Math.max(max, plan.curriculumSemesterNo), 0);
    const finalConfigurationValid = finalPlans.every((plan) => plan.curriculumSemesterNo === maximumCurrentSemester);
    const finalReached = duePlans.some((plan) => plan.isProgramFinal);
    const evaluationScope = finalReached ? "program_completion" : "milestone_progress";
    const coverage = await validateCompletionCoverage(data.trainingProgramId, duePlans);
    const students = await loadCalcStudents(program.sProgramCode, data.cohortId);
    if (!plans.length) blockers.push({ code: "NO_CURRENT_LOCKED_PLANS", message: "Khóa và chương trình đào tạo chưa có kế hoạch hiện hành đã khóa." });
    if (!finalConfigurationValid) blockers.push({ code: "PROGRAM_FINAL_PLAN_INVALID", message: "Kế hoạch cuối CTĐT phải nằm ở học kỳ lộ trình lớn nhất." });
    if (!coverage.valid && duePlans.length) {
      warnings.push({
        code: "PROGRAM_COVERAGE_INVALID",
        message: "Bao phủ chương trình đào tạo chưa hợp lệ; kết quả có thể không kết luận.",
        details: coverage.issues,
      });
    }
    const canRun = blockers.length === 0;
    return {
      valid: canRun,
      canRun,
      scope: {
        cohortId: cohort.id,
        cohortCode: cohort.sCohortCode,
        trainingProgramId: program.id,
        programCode: program.sProgramCode,
        assessmentAcademicTermId: term.id,
        assessmentAcademicYear: year.sYearCode,
        assessmentTermCode: term.sTermCode,
        evaluationScope,
        maxCurriculumSemesterNo: maxSemester,
        programFinalReached: finalReached,
      },
      summary: {
        studentCount: students.length,
        planCount: plans.length,
        duePlanCount: duePlans.length,
        coverageValid: coverage.valid,
        evaluationScope,
      },
      plans: plans.map((plan) => {
        const isDue = termDue(plan, year.sYearCode, term.sTermOrder);
        return {
          id: plan.id,
          academicYear: plan.academicYearCode,
          termCode: plan.termCode,
          curriculumSemesterNo: plan.curriculumSemesterNo,
          version: plan.version,
          status: plan.status,
          isCurrent: plan.isCurrent,
          isSelected: isDue,
          isDue,
          courseCount: plan.courses.length,
          requiredElectiveCredits: plan.requiredElective,
          isProgramFinal: plan.isProgramFinal,
        };
      }),
      blockers,
      warnings,
    };
  }

  static async triggerCompletionRun(data: {
    cohortId: string;
    trainingProgramId: string;
    assessmentAcademicTermId: string;
    evaluationMode?: string;
  }) {
    const mode = data.evaluationMode === "graduation_forecast" ? "graduation_forecast" : "standard";

    // Resolve assessment term info
    const assessmentInfo: any[] = await prisma.$queryRaw`
      SELECT y.s_year_code, t.s_term_code, t.s_term_order
      FROM academic_terms t
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE t.id = ${data.assessmentAcademicTermId}::uuid
    `;
    if (assessmentInfo.length === 0) throw new Error("Assessment term not found");
    const assessmentYear = assessmentInfo[0].s_year_code;
    const assessmentOrder = Number(assessmentInfo[0].s_term_order);

    // Get program code
    const program = await prisma.trainingProgram.findUnique({ where: { id: data.trainingProgramId } });
    if (!program) throw new Error("Training program not found");

    // Load current locked plans for this cohort+program
    const plans = await loadCompletionPlans(data.cohortId, data.trainingProgramId);
    if (plans.length === 0) throw new Error("No current locked plans found");

    // Determine due plans
    const duePlans = plans.filter((p) => termDue(p, assessmentYear, assessmentOrder));
    const coverage = await validateCompletionCoverage(data.trainingProgramId, duePlans);

    // Determine evaluation scope
    const hasFinalPlan = plans.some((p) => p.isProgramFinal);
    const finalIsDue = duePlans.some((p) => p.isProgramFinal);
    const evaluationScope = hasFinalPlan && finalIsDue ? "program_completion" : "milestone_progress";

    // Load students
    const students = await loadCalcStudents(program.sProgramCode, data.cohortId);
    const studentIds = students.map((s) => s.id);

    // Load passing evidence
    const evidence = await loadPassingEvidence(studentIds, assessmentYear, assessmentOrder);

    // Load cumulative GPAs
    const gpas = await loadCumulativeGPAs(studentIds, assessmentYear, assessmentOrder);

    const currentTerm = await prisma.academicTerm.findFirst({
      where: { isCurrent: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    const currentRegistrations = currentTerm
      ? await loadCurrentTermRegistrations(studentIds, currentTerm.id)
      : new Map<string, Set<string>>();

    // Create snapshot hash
    const capturedAt = new Date();
    const snapshotData = { capturedAt, plans: duePlans.map((p) => p.id), studentCount: students.length, coverage };
    const snapshotJSON = JSON.stringify(snapshotData);
    const snapshotHash = crypto.createHash("sha256").update(snapshotJSON).digest("hex");

    // Create the completion run
    const run = await prisma.trainingProgressCompletionRun.create({
      data: {
        cohortId: data.cohortId,
        trainingProgramId: data.trainingProgramId,
        assessmentAcademicTermId: data.assessmentAcademicTermId,
        evaluationMode: mode,
        evaluation_scope: evaluationScope,
        sourceSnapshot: snapshotData as any,
        sourceSnapshotHash: snapshotHash,
        sourceCapturedAt: capturedAt,
        status: "running",
        publicationStatus: "archived",
        totalStudents: 0,
        startedAt: new Date(),
      },
    });

    let completed = 0, incomplete = 0, cannotDetermine = 0;
    let onTrack = 0, behind = 0, pending = 0, noDue = 0, dataErrors = 0;
    const studentRows: Prisma.TrainingProgressCompletionStudentResultCreateManyInput[] = [];
    const planRows: Prisma.TrainingProgressCompletionPlanResultCreateManyInput[] = [];
    const courseRows: Array<{
      id: string;
      plan_result_id: string;
      course_id: string;
      s_course_code: string;
      s_course_name: string;
      s_credits: number;
      requirement_type: string;
      choice_group_code: string | null;
      is_registration_required: boolean;
      passed: boolean;
      pending_result: boolean;
      evidence_offering_id: string | null;
      evidence_academic_year: string | null;
      evidence_term_code: string | null;
      evidence_score_status: string | null;
    }> = [];

    for (const student of students) {
      const studentEvidence = evidence.get(student.id) || new Map<string, PassingEvidence>();
      const studentGPA = gpas.get(student.id);
      const registrations = currentRegistrations.get(student.id) || new Set<string>();

      let allPass = coverage.valid && duePlans.length > 0;
      let duePass = true;
      let duePendingOnly = false;
      let dueHasRealFailure = false;
      let dueCount = 0;
      let duePlansTotal = 0, duePlansPassed = 0, duePlansFailed = 0;
      let allPlansTotal = 0, allPlansPassed = 0, allPlansFailed = 0;
      let totalMissingMandatory = 0, totalMissingRequiredElective = 0, totalMissingElectiveCredits = 0;
      const planResults: CompletionPlanResult[] = [];

      for (const plan of duePlans) {
        const isDuePlan = termDue(plan, assessmentYear, assessmentOrder);
        const pendingEligible = Boolean(
          currentTerm &&
          data.assessmentAcademicTermId === currentTerm.id &&
          plan.academicTermId === currentTerm.id,
        );
        const evalResult = evaluateCompletionPlan(
          plan,
          studentEvidence,
          isDuePlan,
          registrations,
          pendingEligible,
          mode === "graduation_forecast",
        );
        planResults.push(evalResult);

        allPlansTotal++;
        if (evalResult.isPass) {
          allPlansPassed++;
        } else {
          allPlansFailed++;
          allPass = false;
        }

        if (isDuePlan) {
          dueCount++;
          duePlansTotal++;
          if (evalResult.isPass) {
            duePlansPassed++;
          } else {
            duePlansFailed++;
            duePass = false;
            if (evalResult.pendingOnly) duePendingOnly = true;
            else dueHasRealFailure = true;
          }
        }

        totalMissingMandatory += evalResult.missingMandatoryCourses;
        totalMissingRequiredElective += evalResult.missingRequiredElectives;
        totalMissingElectiveCredits += evalResult.missingElectiveCredits;
      }

      let scheduleStatus: string;
      let programCompletionStatus: string;
      let dataErrorReason: string | null = null;

      if (student.dataError) {
        scheduleStatus = "data_error";
        programCompletionStatus = "cannot_determine";
        dataErrorReason = "student_class_or_cohort_missing";
        dataErrors++;
        cannotDetermine++;
      } else {
        // Program completion status
        if (!coverage.valid) {
          programCompletionStatus = "cannot_determine";
          cannotDetermine++;
        } else if (allPass) {
          programCompletionStatus = "completed";
          completed++;
        } else {
          programCompletionStatus = "incomplete";
          incomplete++;
        }

        // Schedule status
        if (dueCount === 0) {
          scheduleStatus = "no_due_plan";
          noDue++;
        } else if (duePass) {
          scheduleStatus = "on_track";
          onTrack++;
        } else if (duePendingOnly && !dueHasRealFailure) {
          scheduleStatus = "pending_result";
          pending++;
        } else {
          scheduleStatus = "behind_schedule";
          behind++;
        }
      }

      const studentResultId = crypto.randomUUID();
      const pendingResultCourses = planResults.reduce((sum, result) => sum + result.pendingResultCourses, 0);
      studentRows.push({
        id: studentResultId,
        runId: run.id,
        studentId: student.id,
        classId: student.classId || null,
        cohortId: student.cohortId || null,
        sStudentId: student.studentCode,
        sStudentName: student.studentName,
        sClassStudentId: student.classCode || null,
        sClassName: student.className || null,
        sProgramCode: student.programCode || null,
        duePlansTotal,
        duePlansPassed,
        duePlansFailed,
        allPlansTotal,
        allPlansPassed,
        allPlansFailed,
        missingMandatoryCourses: totalMissingMandatory,
        missingRequiredElectiveCourses: totalMissingRequiredElective,
        missingElectiveCredits: totalMissingElectiveCredits,
        pendingResultCourses,
        cumulativeGpa10: studentGPA?.gpa10 ?? null,
        cumulativeGpa4: studentGPA?.gpa4 ?? null,
        gpaAcademicYear: studentGPA?.academicYear ?? null,
        gpaTermCode: studentGPA?.termCode ?? null,
        scheduleStatus,
        programCompletionStatus,
        dataErrorReason,
      });

      for (const result of planResults) {
        const planResultId = crypto.randomUUID();
        planRows.push({
          id: planResultId,
          studentResultId,
          planId: result.planId,
          planVersion: result.planVersion,
          academicTermId: result.academicTermId,
          curriculumSemesterNo: result.curriculumSemesterNo,
          isDue: result.isDue,
          isPass: result.isPass,
          missingMandatoryCourses: result.missingMandatoryCourses,
          missingRequiredElectiveCourses: result.missingRequiredElectives,
          requiredElectiveCredits: result.requiredElectiveCredits,
          passedElectiveCredits: result.passedElectiveCredits,
          missingElectiveCredits: result.missingElectiveCredits,
          pendingResultCourses: result.pendingResultCourses,
          choiceGroupResults: result.choiceGroups as unknown as Prisma.InputJsonValue,
        });
        for (const course of result.courses) {
          courseRows.push({
            id: crypto.randomUUID(),
            plan_result_id: planResultId,
            course_id: course.courseId,
            s_course_code: course.courseCode,
            s_course_name: course.courseName,
            s_credits: course.credits,
            requirement_type: course.requirementType,
            choice_group_code: course.choiceGroupCode,
            is_registration_required: course.isRegistrationRequired,
            passed: course.passed,
            pending_result: course.pendingResult,
            evidence_offering_id: course.evidence?.offeringId || null,
            evidence_academic_year: course.evidence?.academicYear || null,
            evidence_term_code: course.evidence?.termCode || null,
            evidence_score_status: course.evidence?.scoreStatus || null,
          });
        }
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        if (studentRows.length) await tx.trainingProgressCompletionStudentResult.createMany({ data: studentRows });
        if (planRows.length) await tx.trainingProgressCompletionPlanResult.createMany({ data: planRows });
        if (courseRows.length) await tx.training_progress_completion_course_results.createMany({ data: courseRows });

        await tx.$executeRaw`
          INSERT INTO training_progress_completion_group_results (
            run_id, group_type, group_id, group_code, group_name,
            total_students, completed_students, incomplete_students, cannot_determine_students,
            on_track_students, behind_schedule_students, pending_result_students
          )
          SELECT ${run.id}::uuid, 'class', c.id, c.class_id, c.class_name,
                 count(sr.id),
                 count(*) FILTER (WHERE sr.program_completion_status='completed'),
                 count(*) FILTER (WHERE sr.program_completion_status='incomplete'),
                 count(*) FILTER (WHERE sr.program_completion_status='cannot_determine'),
                 count(*) FILTER (WHERE sr.schedule_status='on_track'),
                 count(*) FILTER (WHERE sr.schedule_status='behind_schedule'),
                 count(*) FILTER (WHERE sr.schedule_status='pending_result')
          FROM training_progress_completion_student_results sr
          JOIN classes c ON c.id = sr.class_id
          WHERE sr.run_id = ${run.id}::uuid
          GROUP BY c.id, c.class_id, c.class_name
        `;
        await tx.$executeRaw`
          INSERT INTO training_progress_completion_group_results (
            run_id, group_type, group_id, group_code, group_name,
            total_students, completed_students, incomplete_students, cannot_determine_students,
            on_track_students, behind_schedule_students, pending_result_students
          )
          SELECT ${run.id}::uuid, 'cohort', co.id, co.s_cohort_code, co.s_cohort_name,
                 count(sr.id),
                 count(*) FILTER (WHERE sr.program_completion_status='completed'),
                 count(*) FILTER (WHERE sr.program_completion_status='incomplete'),
                 count(*) FILTER (WHERE sr.program_completion_status='cannot_determine'),
                 count(*) FILTER (WHERE sr.schedule_status='on_track'),
                 count(*) FILTER (WHERE sr.schedule_status='behind_schedule'),
                 count(*) FILTER (WHERE sr.schedule_status='pending_result')
          FROM training_progress_completion_student_results sr
          JOIN cohorts co ON co.id = sr.cohort_id
          WHERE sr.run_id = ${run.id}::uuid
          GROUP BY co.id, co.s_cohort_code, co.s_cohort_name
        `;
        await tx.trainingProgressCompletionRun.updateMany({
          where: {
            id: { not: run.id },
            cohortId: data.cohortId,
            trainingProgramId: data.trainingProgramId,
            assessmentAcademicTermId: data.assessmentAcademicTermId,
            evaluationMode: mode,
            status: "completed",
            publicationStatus: "active",
          },
          data: { publicationStatus: "archived" },
        });
        return tx.trainingProgressCompletionRun.update({
          where: { id: run.id },
          data: {
            totalStudents: students.length,
            completedStudents: completed,
            incompleteStudents: incomplete,
            cannotDetermineStudents: cannotDetermine,
            onTrackStudents: onTrack,
            behindScheduleStudents: behind,
            pendingResultStudents: pending,
            noDuePlanStudents: noDue,
            dataErrorStudents: dataErrors,
            status: "completed",
            publicationStatus: "active",
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await prisma.trainingProgressCompletionRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Completion calculation failed",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // ===================== Completion Reports =====================

  static async listCompletionStudents(
    runId: string,
    scheduleStatus?: string,
    programStatus?: string,
    classId?: string,
    page = 1,
    pageSize = 20,
    allowedClassIds?: string[] | null,
  ) {
    const where: any = { runId };
    if (scheduleStatus) where.scheduleStatus = scheduleStatus;
    if (programStatus) where.programCompletionStatus = programStatus;
    if (allowedClassIds !== undefined && allowedClassIds !== null) where.classId = { in: allowedClassIds };
    if (classId) where.classId = allowedClassIds && !allowedClassIds.includes(classId) ? { in: [] } : classId;

    const [total, results] = await Promise.all([
      prisma.trainingProgressCompletionStudentResult.count({ where }),
      prisma.trainingProgressCompletionStudentResult.findMany({
        where,
        orderBy: { sStudentId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: results.map((r) => ({
        studentId: r.sStudentId,
        studentName: r.sStudentName,
        classId: r.sClassStudentId,
        programCode: r.sProgramCode,
        duePlansTotal: r.duePlansTotal,
        duePlansPassed: r.duePlansPassed,
        duePlansFailed: r.duePlansFailed,
        allPlansTotal: r.allPlansTotal,
        allPlansPassed: r.allPlansPassed,
        allPlansFailed: r.allPlansFailed,
        missingMandatoryCourses: r.missingMandatoryCourses,
        missingRequiredElectiveCourses: r.missingRequiredElectiveCourses,
        missingElectiveCredits: r.missingElectiveCredits,
        cumulativeGpa10: r.cumulativeGpa10 != null ? Number(r.cumulativeGpa10) : null,
        cumulativeGpa4: r.cumulativeGpa4 != null ? Number(r.cumulativeGpa4) : null,
        scheduleStatus: r.scheduleStatus,
        programCompletionStatus: r.programCompletionStatus,
        dataErrorReason: r.dataErrorReason,
        pendingResultCourses: r.pendingResultCourses,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async getCompletionStudentDetail(runId: string, studentIdentifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentIdentifier);
    const studentResult = await prisma.trainingProgressCompletionStudentResult.findFirst({
      where: {
        runId,
        OR: [
          { sStudentId: studentIdentifier },
          ...(isUuid ? [{ studentId: studentIdentifier }] : []),
        ],
      },
    });
    if (!studentResult) return null;

    const plans = await prisma.trainingProgressCompletionPlanResult.findMany({
      where: { studentResultId: studentResult.id },
      orderBy: { curriculumSemesterNo: "asc" },
    });
    const planResultIds = plans.map((plan) => plan.id);
    const courses = planResultIds.length
      ? await prisma.training_progress_completion_course_results.findMany({
          where: { plan_result_id: { in: planResultIds } },
          orderBy: [{ requirement_type: "asc" }, { s_course_code: "asc" }],
        })
      : [];
    const coursesByPlan = new Map<string, typeof courses>();
    for (const course of courses) {
      const items = coursesByPlan.get(course.plan_result_id) || [];
      items.push(course);
      coursesByPlan.set(course.plan_result_id, items);
    }

    return {
      studentId: studentResult.sStudentId,
      studentUuid: studentResult.studentId,
      studentName: studentResult.sStudentName,
      classId: studentResult.sClassStudentId,
      className: studentResult.sClassName,
      programCode: studentResult.sProgramCode,
      scheduleStatus: studentResult.scheduleStatus,
      programCompletionStatus: studentResult.programCompletionStatus,
      duePlansTotal: studentResult.duePlansTotal,
      duePlansPassed: studentResult.duePlansPassed,
      duePlansFailed: studentResult.duePlansFailed,
      missingMandatoryCourses: studentResult.missingMandatoryCourses,
      missingRequiredElectiveCourses: studentResult.missingRequiredElectiveCourses,
      missingElectiveCredits: studentResult.missingElectiveCredits,
      pendingResultCourses: studentResult.pendingResultCourses,
      cumulativeGpa10: studentResult.cumulativeGpa10 != null ? Number(studentResult.cumulativeGpa10) : null,
      cumulativeGpa4: studentResult.cumulativeGpa4 != null ? Number(studentResult.cumulativeGpa4) : null,
      dataErrorReason: studentResult.dataErrorReason,
      plans: plans.map((plan) => ({
        id: plan.id,
        planId: plan.planId,
        planVersion: plan.planVersion,
        academicTermId: plan.academicTermId,
        curriculumSemesterNo: plan.curriculumSemesterNo,
        isDue: plan.isDue,
        isPass: plan.isPass,
        missingMandatoryCourses: plan.missingMandatoryCourses,
        missingRequiredElectiveCourses: plan.missingRequiredElectiveCourses,
        requiredElectiveCredits: plan.requiredElectiveCredits,
        passedElectiveCredits: plan.passedElectiveCredits,
        missingElectiveCredits: plan.missingElectiveCredits,
        pendingResultCourses: plan.pendingResultCourses,
        choiceGroupResults: plan.choiceGroupResults,
        courses: (coursesByPlan.get(plan.id) || []).map((course) => ({
          courseId: course.course_id,
          courseCode: course.s_course_code,
          courseName: course.s_course_name,
          credits: course.s_credits,
          requirementType: course.requirement_type,
          choiceGroupCode: course.choice_group_code,
          isRegistrationRequired: course.is_registration_required,
          passed: course.passed,
          pendingResult: course.pending_result,
          evidenceOfferingId: course.evidence_offering_id,
          evidenceAcademicYear: course.evidence_academic_year,
          evidenceTermCode: course.evidence_term_code,
          evidenceScoreStatus: course.evidence_score_status,
        })),
      })),
    };
  }

  static async listCompletionGroups(
    runId: string,
    groupType?: string,
    page = 1,
    pageSize = 20,
    allowedClassIds?: string[] | null,
  ) {
    const where: any = { runId };
    if (groupType) where.groupType = groupType;
    if (allowedClassIds !== undefined && allowedClassIds !== null) {
      where.groupType = "class";
      where.groupId = { in: allowedClassIds };
    }

    const [total, results] = await Promise.all([
      prisma.trainingProgressCompletionGroupResult.count({ where }),
      prisma.trainingProgressCompletionGroupResult.findMany({
        where,
        orderBy: [{ groupType: "asc" }, { groupCode: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: results.map((r) => ({
        groupType: r.groupType,
        groupId: r.groupId,
        groupCode: r.groupCode,
        groupName: r.groupName,
        totalStudents: r.totalStudents,
        completedStudents: r.completedStudents,
        incompleteStudents: r.incompleteStudents,
        cannotDetermineStudents: r.cannotDetermineStudents,
        onTrackStudents: r.onTrackStudents,
        behindScheduleStudents: r.behindScheduleStudents,
        pendingResultStudents: r.pendingResultStudents,
        calculatedAt: r.calculatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async listCompletionPlanSummaries(
    runId: string,
    page = 1,
    pageSize = 20,
    allowedClassIds?: string[] | null,
  ) {
    const students = await prisma.trainingProgressCompletionStudentResult.findMany({
      where: {
        runId,
        ...(allowedClassIds !== undefined && allowedClassIds !== null
          ? { classId: { in: allowedClassIds } }
          : {}),
      },
      select: { id: true },
    });
    const results = await prisma.trainingProgressCompletionPlanResult.findMany({
      where: { studentResultId: { in: students.map((student) => student.id) } },
      orderBy: [{ curriculumSemesterNo: "asc" }, { planVersion: "desc" }],
    });
    const summaries = new Map<string, {
      planId: string;
      planVersion: number;
      curriculumSemesterNo: number;
      totalStudents: number;
      passedStudents: number;
      failedStudents: number;
      dueStudents: number;
    }>();
    for (const result of results) {
      const key = `${result.planId}:${result.planVersion}`;
      const summary = summaries.get(key) || {
        planId: result.planId,
        planVersion: result.planVersion,
        curriculumSemesterNo: result.curriculumSemesterNo,
        totalStudents: 0,
        passedStudents: 0,
        failedStudents: 0,
        dueStudents: 0,
      };
      summary.totalStudents++;
      if (result.isPass) summary.passedStudents++;
      else summary.failedStudents++;
      if (result.isDue) summary.dueStudents++;
      summaries.set(key, summary);
    }
    const allItems = [...summaries.values()].sort((a, b) =>
      a.curriculumSemesterNo - b.curriculumSemesterNo || b.planVersion - a.planVersion,
    );
    return {
      items: allItems.slice((page - 1) * pageSize, page * pageSize),
      total: allItems.length,
      page,
      pageSize,
    };
  }
}
