DROP TRIGGER IF EXISTS academic_warning_policy_definition_immutable ON academic_warning_policies;
DROP FUNCTION IF EXISTS protect_used_academic_warning_policy_definition();

-- Policies that existed before the QĐ600 rule engine are execution policies
-- for the legacy scalar evaluator. Correct their metadata without touching any
-- immutable AcademicWarningRun.source_snapshot already captured historically.
UPDATE academic_warning_policies
SET engine_version = 'academic-warning-legacy-v1',
    policy_definition = jsonb_build_object(
      'schemaVersion', 1,
      'engineVersion', 'academic-warning-legacy-v1',
      'evaluationProfile', 'LEGACY_ADVISORY',
      'executionMode', 'LEGACY_SCALAR_RULES',
      'advisory', jsonb_build_object(
        'label', name,
        'description', 'Chính sách cảnh báo nội bộ dùng các scalar và signal legacy của SEWS.'
      ),
      'thresholds', jsonb_build_object(
        'termGpa4Below', term_gpa_threshold,
        'cumulativeGpa4Below', cumulative_gpa_threshold,
        'conductScoreBelow', conduct_score_threshold
      ),
      'enabledSignals', jsonb_build_array(
        'REGISTRATION_BEHIND',
        'PROGRAM_PROGRESS_BEHIND',
        'LOW_TERM_GPA',
        'LOW_CUMULATIVE_GPA',
        'LOW_CONDUCT_SCORE',
        'ACADEMIC_WARNING_DECISION'
      ),
      'requiredCapabilities', '[]'::jsonb
    ),
    definition_hash = NULL;

-- QĐ600/Điều 18 is retained as a typed definition for Prompt 2B, but is not
-- eligible to become the active execution policy yet.
INSERT INTO academic_warning_policies (
  name,
  schema_version,
  engine_version,
  policy_definition,
  definition_hash,
  term_gpa_threshold,
  cumulative_gpa_threshold,
  conduct_score_threshold,
  version,
  status
)
SELECT
  'QĐ600/QĐ-ĐHĐL - Điều 18 (chưa kích hoạt đánh giá)',
  1,
  'academic-warning-qd600-article18-pending-v1',
  jsonb_build_object(
    'schemaVersion', 1,
    'engineVersion', 'academic-warning-qd600-article18-pending-v1',
    'evaluationProfile', 'QD600_ARTICLE_18',
    'executionMode', 'NOT_YET_ACTIVE_FOR_EVALUATION',
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
  ),
  NULL,
  2.00,
  2.00,
  50,
  COALESCE(MAX(version), 0) + 1,
  'draft'
FROM academic_warning_policies
WHERE NOT EXISTS (
  SELECT 1
  FROM academic_warning_policies existing
  WHERE existing.policy_definition ->> 'evaluationProfile' = 'QD600_ARTICLE_18'
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
