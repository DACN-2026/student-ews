ALTER TABLE students
  ADD COLUMN left_class_decision_id uuid,
  ADD COLUMN left_class_from_year varchar(16),
  ADD COLUMN left_class_from_term smallint,
  ADD COLUMN left_class_effective_at timestamptz;
ALTER TABLE students ADD CONSTRAINT students_departure_complete_check CHECK (
  (left_class_decision_id IS NULL AND left_class_from_year IS NULL AND left_class_from_term IS NULL AND left_class_effective_at IS NULL)
  OR (left_class_decision_id IS NOT NULL AND left_class_from_year ~ '^\d{4}-\d{4}$'
    AND left_class_from_year IS NOT NULL AND left_class_from_term BETWEEN 1 AND 3
    AND left_class_from_term IS NOT NULL AND left_class_effective_at IS NOT NULL)
);
CREATE INDEX students_departure_effective_idx ON students (left_class_effective_at)
  WHERE deleted_at IS NULL AND left_class_effective_at IS NOT NULL;
