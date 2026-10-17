import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { loadSourceCreditRecognitionData } from "./source-credit-recognition";

export type ProgressOffering = {
  s_curriculum_id: string; s_course_name: string; s_credits: number;
  s_year_code: string; s_term_code: string; s_term_order: number;
  score_10: unknown; score_4: unknown; letter_code: string | null; special_code: string | null;
  is_pass: boolean | null; not_score: boolean | null; score_status: string | null; source_payload: unknown;
};

// Preserve checkbox types, key precedence and JSON null exactly as sourcePassOutcome reads them.
export const progressPassPayload = Prisma.sql`CASE
  WHEN g.source_payload IS NULL OR g.source_payload = 'null'::jsonb THEN NULL
  WHEN jsonb_typeof(g.source_payload) = 'object' AND g.source_payload ? 'IsPass'
    THEN jsonb_build_object('IsPass', g.source_payload -> 'IsPass')
  ELSE jsonb_build_object('isPass', g.source_payload -> 'isPass')
END AS source_payload`;

/** Request-local batch data; each student still uses their own program and assessment cutoff. */
export async function loadStudentProgressBatch(studentIds: string[], assessmentCohortId?: string) {
  const [students, recognitions, duplicateOfferings] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds }, deletedAt: null }, include: { studySuspensions: { where: { isRevoked: false } } } }),
    loadSourceCreditRecognitionData(studentIds),
    studentIds.length ? prisma.$queryRaw<Array<{ student_id: string }>>(Prisma.sql`
      SELECT DISTINCT o.student_id::text
      FROM student_course_offerings o
      JOIN academic_terms t ON t.id = o.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE o.student_id IN (${Prisma.join(studentIds.map(id => Prisma.sql`${id}::uuid`))})
      GROUP BY o.student_id, y.s_year_code, t.s_term_order, o.s_curriculum_id
      HAVING COUNT(*) > 1
    `) : [],
  ]);
  const classes = await prisma.class.findMany({ where: { classId: { in: [...new Set(students.flatMap(student => student.sClassStudentId ? [student.sClassStudentId] : []))] }, deletedAt: null } });
  const cohortIds = [...new Set([...classes.flatMap(item => item.cohortId ? [item.cohortId] : []), ...(assessmentCohortId ? [assessmentCohortId] : [])])];
  const cohorts = await prisma.cohort.findMany({ where: { id: { in: cohortIds }, deletedAt: null } });
  return {
    students: new Map(students.map(student => [student.id, student])),
    classes: new Map(classes.map(item => [item.classId, item])),
    cohorts: new Map(cohorts.map(cohort => [cohort.id, cohort])),
    fullSourceStudentIds: new Set(duplicateOfferings.map(row => row.student_id)),
    recognitions,
  };
}

export type StudentProgressBatch = Awaited<ReturnType<typeof loadStudentProgressBatch>>;
