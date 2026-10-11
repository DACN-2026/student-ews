import { prisma } from "@/lib/prisma";
import { courseOutcome, isConditionalCourse, normalizeProgramCourseCode, type CourseOutcomeInput } from "../academic-course-rules";
import { k44ElectiveMembership, type K44ElectiveBlock } from "../k44-elective-blocks";
import { teachingSemesterSurplus } from "../semester-teaching-requirements";
import { loadProgramCurriculum, loadProgramCurriculumCatalog, type CurriculumCatalogCourse } from "./program-curriculum";
import type { ForecastCourse } from "./graduation-forecast";

export type DebtAttempt = CourseOutcomeInput & { courseCode: string; courseName?: string | null; credits: number; academicYear?: string; termCode?: string };
export type CurriculumReviewCourse = {
  courseCode: string; courseName: string; credits: number; catalogProgramCode: string;
  outcome: "passed" | "failed" | "pending" | "unknown" | "VT";
  academicYear?: string; termCode?: string;
};
export type AcademicDebtCalculation = {
  curriculumReviewCourses?: CurriculumReviewCourse[];
  pendingCourses?: Array<{ courseCode: string; courseName: string; credits: number; previousOutcome: "PASSED" | "FAILED" | "NONE" }>;
  accumulatedDebtCredits: number | null;
  dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  reasonCode: string | null;
  outstandingCourses: string[];
  electiveBlocks?: Array<{ block: K44ElectiveBlock; requiredCredits: number; passedCredits: number; failedCredits: number; debtCredits: number; failedCourseCodes: string[] }>;
  semesterSurpluses?: Array<{ semesterNo: number; plannedCredits: number; passedCredits: number; surplusCredits: number }>;
  replacements?: Array<{ semesterNo: number; donorCourseCode: string; donorCredits: number; block: K44ElectiveBlock; settledDebtCredits: number; settledCourses: Array<{ courseCode: string; credits: number }> }>;
  electiveSelections?: Array<{ semesterNo: number; requiredCredits: number | null; passedCredits: number; failedCredits: number; initialDebtCredits: number; remainingDebtCredits: number; failedCourseCodes: string[] }>;
};

type ElectiveFailure = { courseCode: string; credits: number; remainingCredits: number; semesterNo: number; block: K44ElectiveBlock };
type ElectiveDebtPool = { semesterNo: number; requiredCredits: number | null; passedCredits: number; initialDebtCredits: number; remainingDebtCredits: number; failures: ElectiveFailure[] };
type SurplusDonor = { courseCode: string; credits: number; block: K44ElectiveBlock };

/** Reserve each semester's own choices first. The teaching plan has only one
 * mixed A6/A7 pool (HK3); settle single-block pools before that flexible pool. */
function settleSurplusDonors(pools: ElectiveDebtPool[], donors: SurplusDonor[]) {
  const assignments: Array<{ donor: SurplusDonor; settledCourses: Array<{ courseCode: string; credits: number }> }> = [];
  for (const donor of donors) {
    let remaining = donor.credits;
    const settledCourses: Array<{ courseCode: string; credits: number }> = [];
    const orderedPools = [...pools].sort((a, b) =>
      new Set(a.failures.filter(item => item.remainingCredits > 0).map(item => item.block)).size
      - new Set(b.failures.filter(item => item.remainingCredits > 0).map(item => item.block)).size
      || a.semesterNo - b.semesterNo);
    for (const pool of orderedPools) {
      for (const failure of pool.failures.filter(item => item.block === donor.block).sort((a, b) => a.courseCode.localeCompare(b.courseCode))) {
        const credits = Math.min(remaining, pool.remainingDebtCredits, failure.remainingCredits);
        if (credits <= 0) continue;
        pool.remainingDebtCredits -= credits;
        failure.remainingCredits -= credits;
        remaining -= credits;
        settledCourses.push({ courseCode: failure.courseCode, credits });
      }
    }
    assignments.push({ donor, settledCourses });
  }
  return assignments;
}

/** Input must be bounded to the assessment cutoff. A later summer pass clears
 * current debt, while older calls and immutable warning snapshots still see F. */
export function calculateAcademicDebt(attempts: DebtAttempt[], courses: ForecastCourse[], programCode: string, catalog: CurriculumCatalogCourse[] = []): AcademicDebtCalculation {
  if (!courses.length) return { accumulatedDebtCredits: null, dataStatus: "INSUFFICIENT", reasonCode: "CURRICULUM_MISSING", outstandingCourses: [] };
  const identity = (code: string) => {
    const membership = k44ElectiveMembership(code, programCode);
    return membership ? `${membership.block}:${membership.curriculumCourseCode}` : normalizeProgramCourseCode(code, programCode);
  };
  const byCode = new Map<string, ForecastCourse>();
  const conflictingCourses = new Set<string>();
  for (const course of courses) {
    const key = identity(course.courseCode);
    const previous = byCode.get(key);
    if (previous && (previous.credits !== course.credits || previous.semesterNo !== course.semesterNo || previous.requirementType !== course.requirementType)) conflictingCourses.add(key);
    if (!previous) byCode.set(key, course);
  }
  const states = new Map<string, { course: ForecastCourse; failed: boolean; passed: boolean; unresolved: boolean; pending: boolean; absence: boolean }>();
  const curriculumReviewCourses: CurriculumReviewCourse[] = [];
  const reviewKeys = new Set<string>();
  let uncertain = false;
  for (const attempt of attempts) {
    if (isConditionalCourse(attempt.courseCode, attempt.courseName)) continue;
    const course = byCode.get(identity(attempt.courseCode));
    const absence = (attempt.specialCode || attempt.letterCode || "").trim().toUpperCase() === "VT";
    const outcome = absence ? "unknown" : courseOutcome(attempt);
    if (!course) {
      const recognized = catalog.find(item => identity(item.courseCode) === identity(attempt.courseCode));
      const reviewKey = `${attempt.courseCode}|${attempt.academicYear || ""}|${attempt.termCode || ""}|${absence ? "VT" : outcome}`;
      if (recognized && !reviewKeys.has(reviewKey)) {
        reviewKeys.add(reviewKey);
        curriculumReviewCourses.push({ courseCode: attempt.courseCode, courseName: recognized.courseName, credits: attempt.credits,
          catalogProgramCode: recognized.catalogProgramCode, outcome: absence ? "VT" : outcome,
          ...(attempt.academicYear ? { academicYear: attempt.academicYear } : {}), ...(attempt.termCode ? { termCode: attempt.termCode } : {}) });
      }
      if (outcome === "failed" || outcome === "unknown" || outcome === "pending" || k44ElectiveMembership(attempt.courseCode, programCode)) uncertain = true;
      continue;
    }
    if (attempt.credits !== course.credits || conflictingCourses.has(identity(course.courseCode))) uncertain = true;
    const code = identity(course.courseCode);
    const state = states.get(code) ?? { course, failed: false, passed: false, unresolved: false, pending: false, absence: false };
    state.failed ||= outcome === "failed";
    state.passed ||= outcome === "passed";
    state.unresolved ||= outcome === "unknown";
    state.pending ||= outcome === "pending";
    state.absence ||= absence;
    states.set(code, state);
  }
  let debt = 0;
  const pendingCourses: NonNullable<AcademicDebtCalculation["pendingCourses"]> = [];
  let unresolvedAbsence = false;
  const outstandingCourses: string[] = [];
  const groups = new Map<K44ElectiveBlock, { requiredCredits: number; passedCredits: number; failures: ElectiveFailure[] }>();
  for (const state of states.values()) {
    // A completed retry settles current debt, without inventing the old result.
    if (state.unresolved && !state.passed) uncertain = true;
    unresolvedAbsence ||= state.absence && !state.passed;
    if (state.pending) pendingCourses.push({ courseCode: state.course.courseCode, courseName: state.course.courseName, credits: state.course.credits,
      previousOutcome: state.passed ? "PASSED" : state.failed ? "FAILED" : "NONE" });
    const mandatory = /mandatory|bắt buộc/i.test(state.course.requirementType);
    const group = mandatory ? null : k44ElectiveMembership(state.course.courseCode, programCode);
    if (!mandatory && !group) { if (state.failed && !state.passed) uncertain = true; continue; }
    if (group) {
      const totals = groups.get(group.block) ?? { requiredCredits: group.requiredCredits, passedCredits: 0, failures: [] };
      if (state.passed) totals.passedCredits += state.course.credits;
      if (state.failed && !state.passed) totals.failures.push({ courseCode: state.course.courseCode, credits: state.course.credits, remainingCredits: state.course.credits, semesterNo: state.course.semesterNo ?? 0, block: group.block });
      groups.set(group.block, totals);
    } else if (state.failed && !state.passed) { debt += state.course.credits; outstandingCourses.push(state.course.courseCode); }
  }
  const assessedCourses = [...states.values()].map(state => ({ ...state.course, status: state.passed ? "PASSED" : "NOT_PASSED" }));
  // Course identity is counted once, even when a later summer retake supplies
  // the pass. Credit surplus belongs to the course's planned semester.
  const semesterNos = [...new Set(assessedCourses.map(course => course.semesterNo ?? 0))].sort((a, b) => a - b);
  const semesterSurpluses: NonNullable<AcademicDebtCalculation["semesterSurpluses"]> = [];
  const replacements: NonNullable<AcademicDebtCalculation["replacements"]> = [];
  const usedDonors = new Set<string>();
  let missingPlan = false;
  const allFailures = [...groups.values()].flatMap(group => group.failures);
  const assignedFailures = new Set<ElectiveFailure>();
  const debtPools: ElectiveDebtPool[] = [];
  const semesterAssessments = semesterNos.map(semesterNo => {
    const semesterCourses = assessedCourses.filter(course => course.semesterNo === semesterNo);
    return { semesterNo, semesterCourses, surplus: teachingSemesterSurplus(semesterNo, programCode, semesterCourses) };
  });
  // A failure among optional alternatives is not debt once the semester's own
  // choice quota is met. Only its unmet quota can be carried to other semesters.
  for (const { semesterNo, surplus } of semesterAssessments) {
    if (!surplus) continue;
    for (const choice of surplus.groups) {
      const failures = allFailures.filter(failure => failure.semesterNo === semesterNo && !assignedFailures.has(failure)
        && choice.courses.some(item => identity(item.code) === identity(failure.courseCode) && item.credits === failure.credits));
      if (!failures.length) continue;
      failures.forEach(failure => assignedFailures.add(failure));
      const failedCredits = failures.reduce((sum, failure) => sum + failure.credits, 0);
      const initialDebtCredits = Math.min(failedCredits, Math.max(0, choice.requiredCredits - choice.passedCredits));
      debtPools.push({ semesterNo, requiredCredits: choice.requiredCredits, passedCredits: choice.passedCredits, initialDebtCredits, remainingDebtCredits: initialDebtCredits, failures });
    }
  }
  for (const failure of allFailures.filter(item => !assignedFailures.has(item))) {
    // No validated choice quota: preserve the failure without inventing relief.
    missingPlan = true;
    debtPools.push({ semesterNo: failure.semesterNo, requiredCredits: null, passedCredits: 0, initialDebtCredits: failure.credits, remainingDebtCredits: failure.credits, failures: [failure] });
  }
  for (const { semesterNo, semesterCourses, surplus } of semesterAssessments) {
    if (!surplus) {
      if (semesterCourses.some(course => {
        const block = k44ElectiveMembership(course.courseCode, programCode)?.block;
        return block && debtPools.some(pool => pool.remainingDebtCredits > 0 && pool.failures.some(failure => failure.block === block));
      })) missingPlan = true;
      continue;
    }
    semesterSurpluses.push({ semesterNo, plannedCredits: surplus.plannedCredits, passedCredits: surplus.passedCredits, surplusCredits: surplus.surplusCredits });
    let semesterBudget = surplus.surplusCredits;
    for (const pool of surplus.groups) {
      const budget = Math.min(semesterBudget, pool.surplusCredits);
      const donors = pool.passedCourses.flatMap(course => {
        const membership = k44ElectiveMembership(course.courseCode, programCode);
        return membership && !usedDonors.has(identity(course.courseCode)) ? [{ ...course, block: membership.block }] : [];
      }).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
      // Pools in the teaching plan contain at most five alternatives. Select
      // whole surplus courses so a 4-TC pass in a 3-TC quota cannot donate 1 TC.
      // Prefer the subset settling most debt, then consuming fewest credits.
      let selected: typeof donors = [];
      let bestSettled = 0;
      let bestCost = 0;
      for (let mask = 1; mask < 2 ** donors.length; mask++) {
        const subset = donors.filter((_, index) => mask & (1 << index));
        const cost = subset.reduce((sum, item) => sum + item.credits, 0);
        if (cost > budget) continue;
        const trial = settleSurplusDonors(debtPools.map(pool => ({ ...pool, failures: pool.failures.map(failure => ({ ...failure })) })), subset);
        const settled = trial.reduce((sum, item) => sum + item.settledCourses.reduce((total, course) => total + course.credits, 0), 0);
        if (settled > bestSettled || settled === bestSettled && cost < bestCost) { selected = subset; bestSettled = settled; bestCost = cost; }
      }
      for (const { donor, settledCourses } of settleSurplusDonors(debtPools, selected)) {
        usedDonors.add(identity(donor.courseCode));
        replacements.push({ semesterNo, donorCourseCode: donor.courseCode, donorCredits: donor.credits, block: donor.block, settledDebtCredits: settledCourses.reduce((sum, course) => sum + course.credits, 0), settledCourses });
        semesterBudget -= donor.credits;
      }
    }
  }
  const debtByBlock = new Map<K44ElectiveBlock, number>();
  for (const pool of debtPools) {
    let remaining = pool.remainingDebtCredits;
    for (const failure of [...pool.failures].sort((a, b) => a.courseCode.localeCompare(b.courseCode))) {
      const credits = Math.min(remaining, failure.remainingCredits);
      debtByBlock.set(failure.block, (debtByBlock.get(failure.block) ?? 0) + credits);
      remaining -= credits;
      if (pool.remainingDebtCredits > 0 && failure.remainingCredits > 0) outstandingCourses.push(failure.courseCode);
    }
  }
  const electiveBlocks = [...groups].map(([block, group]) => {
    const failedCredits = group.failures.reduce((sum, item) => sum + item.credits, 0);
    const debtCredits = debtByBlock.get(block) ?? 0;
    const failedCourseCodes = group.failures.map(item => item.courseCode);
    debt += debtCredits;
    return { block, requiredCredits: group.requiredCredits, passedCredits: group.passedCredits, failedCredits, debtCredits, failedCourseCodes };
  });
  const electiveSelections = debtPools.map(pool => ({ semesterNo: pool.semesterNo, requiredCredits: pool.requiredCredits, passedCredits: pool.passedCredits,
    failedCredits: pool.failures.reduce((sum, failure) => sum + failure.credits, 0), initialDebtCredits: pool.initialDebtCredits, remainingDebtCredits: pool.remainingDebtCredits, failedCourseCodes: pool.failures.map(failure => failure.courseCode) }));
  const scopeUnresolved = curriculumReviewCourses.some(course => course.outcome !== "passed");
  return { accumulatedDebtCredits: debt, dataStatus: uncertain || missingPlan ? "PARTIAL" : "COMPLETE", reasonCode: scopeUnresolved ? "CURRICULUM_SCOPE_REQUIRES_VERIFICATION" : unresolvedAbsence ? "EXAM_ABSENCE_REQUIRES_VERIFICATION" : uncertain ? "UNRESOLVED_HISTORICAL_ATTEMPTS" : missingPlan ? "ELECTIVE_REPLACEMENT_PLAN_MISSING" : null, outstandingCourses, electiveBlocks, semesterSurpluses, replacements, electiveSelections, pendingCourses,
    ...(curriculumReviewCourses.length ? { curriculumReviewCourses } : {}) };
}

export async function loadAcademicDebt(studentIds: string[], programId: string, assessmentTermId: string) {
  const result = new Map<string, AcademicDebtCalculation>();
  if (!studentIds.length) return result;
  const [term, program, courses, catalog] = await Promise.all([
    prisma.academicTerm.findUnique({ where: { id: assessmentTermId } }),
    prisma.trainingProgram.findUnique({ where: { id: programId } }), loadProgramCurriculum(programId), loadProgramCurriculumCatalog(programId),
  ]);
  if (!term || !program) return result;
  const year = await prisma.academicYear.findUnique({ where: { id: term.academicYearId } });
  if (!year) return result;
  const rows: Array<DebtAttempt & { student_id: string }> = await prisma.$queryRaw`
    SELECT o.student_id::text, o.s_curriculum_id AS "courseCode", o.s_course_name AS "courseName", o.s_credits AS credits,
      y.s_year_code AS "academicYear", t.s_term_code AS "termCode",
      g.is_pass AS "isPass", g.not_score AS "notScore", g.score_status AS "scoreStatus", g.special_code AS "specialCode",
      g.letter_code AS "letterCode", g.score_10 AS "score10", g.score_4 AS "score4"
    FROM student_course_offerings o JOIN academic_years y ON y.id = o.academic_year_id
    JOIN academic_terms t ON t.id = o.academic_term_id LEFT JOIN student_course_grades g ON g.offering_id = o.id
    WHERE o.student_id = ANY(${studentIds}::uuid[]) AND (y.s_year_code < ${year.sYearCode}
      OR (y.s_year_code = ${year.sYearCode} AND t.s_term_order <= ${term.sTermOrder}))
  `;
  const unscoped = new Set((await prisma.unscopedGradeRecord.findMany({ where: { studentId: { in: studentIds } },
    select: { studentId: true, sCourseCode: true, sCourseName: true, reason: true } }))
    // GDTC/GDQP remain unresolved certificate evidence; they do not affect academic F debt.
    .filter(row => !isConditionalCourse(row.sCourseCode, row.sCourseName)).map((row) => row.studentId));
  for (const studentId of studentIds) {
    const debt = calculateAcademicDebt(rows.filter((row) => row.student_id === studentId), courses, program.sProgramCode, catalog);
    if (unscoped.has(studentId)) { debt.dataStatus = "PARTIAL"; debt.reasonCode = "UNSCOPED_HISTORICAL_ATTEMPTS"; }
    result.set(studentId, debt);
  }
  return result;
}
