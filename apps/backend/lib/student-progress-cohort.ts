import { isConditionalCourse, normalizeProgramCourseCode, normalizeCourseName } from "./academic-course-rules";

/** An explicitly configured schedule takes precedence over inferred activity. */
export function studentProgressCohort(student: {
  progressCohortCode?: string | null;
  progressCohortFromYear?: string | null;
}, academicYear: string): string | null {
  const code = student.progressCohortCode?.trim().toUpperCase();
  const from = student.progressCohortFromYear;
  if (!code || !/^K\d+$/.test(code) || !from || !/^\d{4}-\d{4}$/.test(from) || academicYear < from) return null;
  return code;
}

type PlanCourse = { courseCode: string; courseName: string; semesterNo: number; credits: number; requirementType: string; isConditional?: boolean };
type Registration = { courseCode: string; courseName?: string | null; academicYear?: string | null; termCode?: string | null; credits?: number | null };
export type InferredProgressCohort = {
  cohortCode: string;
  anchorAcademicYear: string;
  anchorTermCode: string;
  anchorSemesterNo: number;
  delayedYears: number;
  evidence: "CONTINUING_SEQUENCE" | "MAIN_TERM_BREAK";
};

/** Infer a schedule from a complete first-time compulsory semester and either
 * the preceding study sequence or a break in two main terms. An isolated old
 * registration, a retake, or a mixture of semester groups is insufficient. */
export function inferStudentProgressCohort(input: {
  administrativeCohortCode: string | null;
  programCode: string | null;
  currentAcademicYear: string;
  currentTermCode: string;
  curriculum: PlanCourse[];
  registrations: Registration[];
}): InferredProgressCohort | null {
  const cohortNo = Number(input.administrativeCohortCode?.match(/^K(\d+)$/i)?.[1]);
  if (!cohortNo) return null;
  const normalize = (code: string) => normalizeProgramCourseCode(code,input.programCode);
  const courses = input.curriculum.filter(c => !c.isConditional && c.requirementType !== "conditional" &&
    !isConditionalCourse(c.courseCode,c.courseName) && c.credits > 0);
  const byCode = new Map(courses.map(c => [normalize(c.courseCode),c]));
  const byName = new Map<string,PlanCourse[]>();
  for (const course of courses) {
    const name=normalizeCourseName(course.courseName);
    byName.set(name,[...(byName.get(name)||[]),course]);
  }
  const termNo = (term: string | null | undefined) => Number(term?.match(/^(?:HK)?0?([123])$/i)?.[1]);
  const ordinal = (year: string | null | undefined, term: string | null | undefined) => {
    const start=Number(year?.match(/^(\d{4})-\d{4}$/)?.[1]);const no=termNo(term);
    return start && no ? start*3+no-1 : null;
  };
  const current=ordinal(input.currentAcademicYear,input.currentTermCode);
  if (current===null) return null;
  const rows=input.registrations.map(registration => {
    const exact=byCode.get(normalize(registration.courseCode));
    const named=byName.get(normalizeCourseName(registration.courseName))||[];
    const course=exact||(named.length===1?named[0]:undefined);
    return {registration,course,order:ordinal(registration.academicYear,registration.termCode)};
  }).filter(row => row.order!==null && row.order<=current &&
    !isConditionalCourse(row.registration.courseCode,row.registration.courseName) &&
    (row.course?.credits ?? row.registration.credits ?? 0)>0);
  const mainRows=rows.filter(row=>termNo(row.registration.termCode)<=2);
  const anchors=[...new Set(mainRows.map(row=>row.order!))].sort((a,b)=>b-a);
  for (const anchor of anchors) {
  const currentRows=mainRows.filter(row=>row.order===anchor);
  if (currentRows.some(row=>!row.course)) return null;
  const semesters=[...new Set(currentRows.map(row=>row.course!.semesterNo))];
  if (semesters.length!==1) continue;
  const semester=semesters[0];
  const anchorYear=currentRows[0].registration.academicYear!;
  const anchorTerm=termNo(currentRows[0].registration.termCode);
  const administrativeSemester=(Number(anchorYear.slice(0,4))-(1976+cohortNo))*2+anchorTerm;
  // Count earlier offerings, including summer; do not mistake retakes for a new schedule.
  if (currentRows.some(row=>rows.some(older=>older.order!<anchor && older.course &&
    normalize(older.course.courseCode)===normalize(row.course!.courseCode)))) continue;
  const gap=administrativeSemester-semester;
  // A later regular semester aligned with the administrative cohort supersedes
  // an earlier inferred delay; later retakes alone do not erase its evidence.
  if (gap<=0) return null;
  if (gap%2!==0) continue;
  const required=courses.filter(c=>c.semesterNo===semester&&
    (c.requirementType.toLocaleLowerCase("vi").includes("bắt") || ["mandatory","compulsory"].includes(c.requirementType.trim().toLowerCase())));
  const enrolledCodes=new Set(currentRows.map(row=>normalize(row.course!.courseCode)));
  if (required.length<3 || required.some(c=>!enrolledCodes.has(normalize(c.courseCode)))) continue;
  const anchorStart=Number(anchorYear.slice(0,4));
  const previous=anchorTerm===1 ? (anchorStart-1)*3+1 : anchorStart*3;
  const beforePrevious=anchorTerm===1 ? (anchorStart-1)*3 : (anchorStart-1)*3+1;
  const previousRows=mainRows.filter(row=>row.order===previous);
  const continuing=previousRows.length>=3 && previousRows.every(row=>row.course?.semesterNo===semester-1) &&
    previousRows.every(row=>!rows.some(older=>older.order!<previous && older.course &&
      normalize(older.course.courseCode)===normalize(row.course!.courseCode)));
  const mainTermBreak=previousRows.length===0 && !mainRows.some(row=>row.order===beforePrevious) &&
    mainRows.some(row=>row.order!<beforePrevious);
  if (!continuing && !mainTermBreak) continue;
  return {cohortCode:`K${cohortNo+gap/2}`,anchorAcademicYear:anchorYear,anchorTermCode:`HK0${anchorTerm}`,
    anchorSemesterNo:semester,delayedYears:gap/2,evidence:continuing?"CONTINUING_SEQUENCE":"MAIN_TERM_BREAK"};
  }
  return null;
}
