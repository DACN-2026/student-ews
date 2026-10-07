-- Distinct courses may have empty study/schedule IDs in the source API.
-- Creating the replacement first ensures failure leaves the original intact.
CREATE UNIQUE INDEX IF NOT EXISTS "student_course_offerings_source_course_key"
ON "student_course_offerings" ("student_id", "academic_term_id", "s_curriculum_id", "s_study_unit_id", "s_schedule_study_unit_id");
-- Existing installations may have created the original key as a constraint.
ALTER TABLE "student_course_offerings" DROP CONSTRAINT IF EXISTS "student_course_offerings_student_id_academic_term_id_s_stud_key";
DROP INDEX IF EXISTS "student_course_offerings_student_id_academic_term_id_s_stud_key";
