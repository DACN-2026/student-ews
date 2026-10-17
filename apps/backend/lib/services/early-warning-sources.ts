import { prisma } from "@/lib/prisma";
import { buildAcademicTermLinks, compareAcademicTerms } from "../academic-terms";
import { courseOutcome, sourcePassOutcome, isConditionalCourse, normalizeProgramCourseCode } from "../academic-course-rules";
import { EMPTY_EARLY_WARNING_SOURCES, type EarlyWarningSources } from "./early-warning-signals";
import type { AcademicDebtCalculation } from "./academic-debt";
import type { AssessmentTermCourseAttempt } from "./academic-warning-capabilities";

export function assessmentTermExamAbsences(attempts: AssessmentTermCourseAttempt[]): NonNullable<EarlyWarningSources["examAbsences"]> {
  const byOffering = new Map(attempts.map(attempt => [attempt.offeringId, attempt]));
  return [...byOffering.values()].filter(attempt => attempt.specialCode?.trim().toUpperCase() === "VT" && Number.isFinite(attempt.credits) && attempt.credits >= 0)
    .map(attempt => ({ offeringId: attempt.offeringId, courseCode: attempt.courseCode || "", courseName: attempt.courseName || "", credits: attempt.credits,
      conditional: isConditionalCourse(attempt.courseCode, attempt.courseName), isPass: attempt.isPass }));
}

export function verifiedRepeatedFailureSource(source: EarlyWarningSources | undefined, debt: AcademicDebtCalculation | undefined): EarlyWarningSources | undefined {
  if (!source) return undefined;
  return { ...source, repeatedFailedCourses: debt?.dataStatus === "COMPLETE" && source.repeatedFailedCourses !== null
    ? source.repeatedFailedCourses.filter(course => debt.outstandingCourses.includes(course.courseCode)) : null };
}

export async function loadEarlyWarningSources(studentIds: string[], programCode: string, assessmentTermId: string) {
  const result = new Map<string, EarlyWarningSources>();
  if (!studentIds.length) return result;
  const [terms, years] = await Promise.all([
    prisma.academicTerm.findMany({ where: { deletedAt: null } }),
    prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
  ]);
  const yearById = new Map(years.map(year => [year.id, year.sYearCode]));
  const timeline = terms.map(term => ({ id: term.id, academicYearId: term.academicYearId,
    academicYearCode: yearById.get(term.academicYearId) || "", termOrder: term.sTermOrder,
    isSummer: term.sIsSummer, startDate: term.startDate, endDate: term.endDate }));
  const assessment = timeline.find(term => term.id === assessmentTermId);
  if (!assessment) return result;
  const previousTermId = buildAcademicTermLinks(timeline).get(assessmentTermId)?.previousMainTermId || null;
  const previousFinalized = Boolean(terms.find(term => term.id === previousTermId)?.gradesFinalizedAt);
  const cutoffTermIds = timeline.filter(term => compareAcademicTerms(term, assessment) <= 0).map(term => term.id);
  const periodIds = [assessmentTermId, ...(previousTermId ? [previousTermId] : [])];
  const [summaries, cumulatives, conduct, offerings] = await Promise.all([
    previousTermId && previousFinalized ? prisma.studentTermSummary.findMany({ where: { studentId: { in: studentIds }, sProgramCode: programCode, academicTermId: previousTermId } }) : [],
    previousTermId && previousFinalized ? prisma.studentCumulativeSummary.findMany({ where: { studentId: { in: studentIds }, sProgramCode: programCode, sourceAcademicTermId: previousTermId } }) : [],
    prisma.studentConductRecord.findMany({ where: { studentId: { in: studentIds }, academicTermId: { in: periodIds } } }),
    prisma.studentCourseOffering.findMany({ where: { studentId: { in: studentIds }, sProgramCode: programCode, academicTermId: { in: cutoffTermIds } } }),
  ]);
  const grades = offerings.length ? await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map(offering => offering.id) } } }) : [];
  const gradeById = new Map(grades.map(grade => [grade.offeringId, grade]));
  const summaryByStudent = new Map(summaries.map(summary => [summary.studentId, summary]));
  const cumulativeByStudent = new Map(cumulatives.map(summary => [summary.studentId, summary]));
  const conductByPeriod = new Map(conduct.map(record => [`${record.studentId}:${record.academicTermId}`, record]));
  const numeric = (value: unknown) => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  const conductSource = (studentId: string, termId: string | null) => {
    const record = termId ? conductByPeriod.get(`${studentId}:${termId}`) : null;
    return record ? { id: record.id, score: numeric(record.lastScore), statusId: record.statusId } : null;
  };
  const coursesByStudent = new Map<string, Map<string, { courseName: string; failures: number; passed: boolean }>>();
  const absencesByStudent = new Map<string, NonNullable<EarlyWarningSources["examAbsences"]>>();
  for (const offering of offerings) {
    const grade = gradeById.get(offering.id);
    if (!grade) continue;
    if (grade.specialCode?.trim().toUpperCase() === "VT") {
      if (offering.academicTermId === assessmentTermId) {
        const absences = absencesByStudent.get(offering.studentId) || [];
        absences.push({ offeringId: offering.id, courseCode: offering.sCurriculumId, courseName: offering.sCourseName, credits: offering.sCredits,
          conditional: isConditionalCourse(offering.sCurriculumId, offering.sCourseName), isPass: sourcePassOutcome(grade.sourcePayload) });
        absencesByStudent.set(offering.studentId, absences);
      }
    }
    if (isConditionalCourse(offering.sCurriculumId, offering.sCourseName)) continue;
    const outcome = courseOutcome({ ...grade, score10: numeric(grade.score10), score4: numeric(grade.score4) });
    const courses = coursesByStudent.get(offering.studentId) || new Map();
    const code = normalizeProgramCourseCode(offering.sCurriculumId, programCode);
    const course = courses.get(code) || { courseName: offering.sCourseName, failures: 0, passed: false };
    if (outcome === "failed") course.failures++;
    if (outcome === "passed") course.passed = true;
    courses.set(code, course); coursesByStudent.set(offering.studentId, courses);
  }
  for (const studentId of studentIds) {
    const previous = summaryByStudent.get(studentId);
    result.set(studentId, {
      ...EMPTY_EARLY_WARNING_SOURCES, previousTermId,
      examAbsences: absencesByStudent.get(studentId) || [],
      previousTermGpa4: numeric(previous?.gpa4),
      previousCumulativeGpa4: numeric(cumulativeByStudent.get(studentId)?.cumulativeGpa4 ?? previous?.cumulativeGpa4),
      conduct: conductSource(studentId, assessmentTermId), previousConduct: conductSource(studentId, previousTermId),
      repeatedFailedCourses: [...(coursesByStudent.get(studentId) || [])].filter(([, course]) => !course.passed && course.failures >= 2)
        .map(([courseCode, course]) => ({ courseCode, courseName: course.courseName, failedAttempts: course.failures })),
    });
  }
  return result;
}
