ALTER TABLE academic_warning_runs
  ADD COLUMN run_mode varchar(32) NOT NULL DEFAULT 'OFFICIAL';

UPDATE academic_warning_runs AS r
SET run_mode = 'LEGACY_SUMMER'
FROM academic_terms AS t
WHERE t.id = r.assessment_academic_term_id
  AND t.s_is_summer = true;

CREATE INDEX academic_warning_runs_mode_term_idx
  ON academic_warning_runs (run_mode, assessment_academic_term_id, started_at DESC);
