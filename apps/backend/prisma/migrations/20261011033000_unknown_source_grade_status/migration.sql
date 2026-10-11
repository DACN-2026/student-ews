-- Blank results are neither final grades nor an explicit pending flag.
BEGIN;
ALTER TABLE student_course_grades
  DROP CONSTRAINT IF EXISTS student_course_grades_score_status_check;
ALTER TABLE student_course_grades
  ADD CONSTRAINT student_course_grades_score_status_check
  CHECK (score_status IN ('pending', 'graded', 'special', 'unknown'));
ALTER TABLE student_course_grades
  ADD CONSTRAINT student_course_grades_unknown_result_check
  CHECK (score_status <> 'unknown' OR (
    score_10 IS NULL AND score_4 IS NULL AND special_code IS NULL
    AND upper(trim(coalesce(letter_code, ''))) IN ('', 'N/A')
    AND NOT is_pass AND NOT not_score
  ));
COMMIT;
