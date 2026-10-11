CREATE TABLE student_study_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL UNIQUE,
  decision_number text NOT NULL,
  from_year varchar(9) NOT NULL,
  from_term smallint NOT NULL CHECK (from_term BETWEEN 1 AND 3),
  effective_at timestamptz NOT NULL,
  return_decision_id uuid,
  return_year varchar(9),
  return_term smallint CHECK (return_term BETWEEN 1 AND 3),
  return_effective_at timestamptz,
  is_revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_study_suspensions_return_check CHECK (
    (return_decision_id IS NULL AND return_year IS NULL AND return_term IS NULL AND return_effective_at IS NULL)
    OR (return_decision_id IS NOT NULL AND return_year IS NOT NULL AND return_term IS NOT NULL AND return_effective_at IS NOT NULL
      AND (return_year > from_year OR (return_year = from_year AND return_term >= from_term)))
  )
);
CREATE INDEX student_study_suspensions_period_idx ON student_study_suspensions(student_id, from_year, from_term);
CREATE INDEX student_study_suspensions_current_idx ON student_study_suspensions(effective_at, return_effective_at);
