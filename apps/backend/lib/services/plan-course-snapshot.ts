import { ApiError } from "../utils/api-error";

type CatalogCourse = { id: string; sCourseCode: string; sCourseName: string };
type Requirement = { courseId: string; courseCode: string; credits: number; semesterNo: number | null; requirementType: string };
type PlanRow = { id: string; courseId: string; sCourseCode: string; sCourseName: string; sCredits: number; requirementType: string };

/** A plan's descriptive snapshot belongs to the selected catalog ID. Client
 * labels, similar names and code suffixes cannot change that identity. */
export function canonicalPlanCourseSnapshots<T extends { courseId: string }>(rows: T[], catalog: CatalogCourse[]) {
  const byId = new Map(catalog.map(course => [course.id, course]));
  const seen = new Set<string>();
  return rows.map(row => {
    const course = byId.get(row.courseId);
    if (!course) throw new ApiError(`Không tìm thấy học phần đã chọn: ${row.courseId}`, "PLAN_INVALID", 422);
    if (seen.has(row.courseId)) throw new ApiError(`Học phần bị lặp trong kế hoạch: ${course.sCourseCode}`, "PLAN_INVALID", 422);
    seen.add(row.courseId);
    return { ...row, courseCode: course.sCourseCode, courseName: course.sCourseName };
  });
}

/** Repair only a mislabeled snapshot of the SAME catalog/course requirement.
 * This never establishes equivalence between different course IDs or changes
 * credit requirements, selection groups, semesters or transcript attempts. */
export function reconcilePlanCourseSnapshots<T extends PlanRow>(rows: T[], catalog: CatalogCourse[], requirements: Requirement[], semesterNo: number) {
  const byId = new Map(catalog.map(course => [course.id, course]));
  const changes: Array<{ planCourseId: string; courseId: string; beforeCode: string; afterCode: string; beforeName: string; afterName: string; credits: number; semesterNo: number }> = [];
  const issues: string[] = [];
  const courses = rows.map(row => {
    const course = byId.get(row.courseId);
    if (!course) { issues.push(`Không tìm thấy ID học phần ${row.courseId}`); return row; }
    if (row.sCourseCode === course.sCourseCode && row.sCourseName === course.sCourseName) return row;
    const requirement = requirements.find(item => item.courseId === row.courseId);
    const type = /bắt buộc|mandatory/i.test(requirement?.requirementType ?? "") ? "mandatory" : "elective";
    if (!requirement || requirement.courseCode !== course.sCourseCode || requirement.semesterNo !== semesterNo
      || requirement.credits !== row.sCredits || type !== row.requirementType) {
      issues.push(`Chưa đủ căn cứ cùng ID, kỳ, tín chỉ và loại yêu cầu cho ${row.sCourseCode} (${row.courseId})`);
      return row;
    }
    changes.push({ planCourseId: row.id, courseId: row.courseId, beforeCode: row.sCourseCode, afterCode: course.sCourseCode,
      beforeName: row.sCourseName, afterName: course.sCourseName, credits: row.sCredits, semesterNo });
    return { ...row, sCourseCode: course.sCourseCode, sCourseName: course.sCourseName };
  });
  return { courses, changes, issues };
}
