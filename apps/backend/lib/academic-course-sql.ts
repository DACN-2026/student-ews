import { Prisma } from "@prisma/client";

/** SQL counterpart of isConditionalCourse, for queries with offering alias o. */
export const academicOfferingPredicate = Prisma.sql`NOT (
  UPPER(BTRIM(o.s_curriculum_id)) ~ '^(QP[0-9]|(25)?TC[0-9]|SHCD)'
  OR LOWER(o.s_course_name) ~ 'giáo dục (thể chất|quốc phòng)|sinh hoạt công dân'
)`;
