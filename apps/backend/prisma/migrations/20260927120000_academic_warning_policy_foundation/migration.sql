ALTER TABLE academic_warning_policies
  ADD COLUMN schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN engine_version varchar(96) NOT NULL DEFAULT 'academic-warning-legacy-v1',
  ADD COLUMN policy_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN definition_hash varchar(64);

UPDATE academic_warning_policies
SET policy_definition = jsonb_build_object(
      'schemaVersion', 1,
      'engineVersion', 'academic-warning-legacy-v1',
      'regulatory', jsonb_build_object(
        'sourceCode', 'QD600-DHDL-2021',
        'sourceName', 'Quyết định 600/QĐ-ĐHĐL ban hành Quy chế đào tạo trình độ đại học của Trường Đại học Đà Lạt',
        'sourceVersion', '600/QĐ-ĐHĐL@2021-08-31',
        'issuedDate', '2021-08-31',
        'effectiveFromAcademicYear', '2021-2022',
        'applicableFromCohort', 'K45',
        'articleRefs', jsonb_build_array('Điều 18'),
        'documentChecksum', '6e1932e7a8463e7f64785894f97a27c6783d50d0833f7b1632e343e2906bd3d3'
      ),
      'thresholds', jsonb_build_object(
        'failedCreditRatio', jsonb_build_object('operator', '>', 'value', 0.50),
        'accumulatedDebtCredits', jsonb_build_object('operator', '>', 'value', 24),
        'termGpa', jsonb_build_object('firstSemesterBelow', 0.80, 'subsequentSemesterBelow', 1.00),
        'cumulativeGpaByYear', jsonb_build_array(
          jsonb_build_object('yearLevel', 1, 'gpa4Below', 1.20),
          jsonb_build_object('yearLevel', 2, 'gpa4Below', 1.40),
          jsonb_build_object('yearLevel', 3, 'gpa4Below', 1.60),
          jsonb_build_object('yearLevel', 4, 'gpa4Below', 1.80)
        )
      ),
      'advisory', jsonb_build_object('earlyWarningMarginGpa4', 0.20, 'advisoryOnly', true),
      'requiredCapabilities', jsonb_build_array(
        'FIRST_TERM_DETECTION',
        'YEAR_LEVEL_CLASSIFICATION',
        'FAILED_CREDIT_CALCULATION',
        'ACCUMULATED_DEBT_CREDIT_CALCULATION',
        'SUMMER_MAIN_TERM_MERGE_VERIFIED'
      )
    );

CREATE OR REPLACE FUNCTION protect_used_academic_warning_policy_definition()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM academic_warning_runs r
    WHERE r.policy_id = OLD.id
      AND r.status = 'completed'
      AND r.run_mode = 'OFFICIAL'
  ) AND (
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.engine_version IS DISTINCT FROM OLD.engine_version
    OR NEW.policy_definition IS DISTINCT FROM OLD.policy_definition
    OR NEW.definition_hash IS DISTINCT FROM OLD.definition_hash
    OR NEW.term_gpa_threshold IS DISTINCT FROM OLD.term_gpa_threshold
    OR NEW.cumulative_gpa_threshold IS DISTINCT FROM OLD.cumulative_gpa_threshold
    OR NEW.conduct_score_threshold IS DISTINCT FROM OLD.conduct_score_threshold
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'Academic warning policy versions used by completed official runs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER academic_warning_policy_definition_immutable
BEFORE UPDATE ON academic_warning_policies
FOR EACH ROW EXECUTE FUNCTION protect_used_academic_warning_policy_definition();
