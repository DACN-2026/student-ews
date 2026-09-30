ALTER TABLE "academic_warning_runs"
  ADD COLUMN "execution_profile" VARCHAR(48) NOT NULL DEFAULT 'LEGACY_SCALAR_RULES';

ALTER TABLE "academic_warning_student_results"
  ADD COLUMN "business_status" VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "regulatory_coverage" VARCHAR(16),
  ADD COLUMN "rule_results" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "academic_warning_student_results"
SET "business_status" = CASE
  WHEN "max_severity" = 'high' THEN 'HIGH_RISK'
  WHEN "max_severity" = 'medium' OR "reason_count" > 0 THEN 'MONITORING'
  WHEN "data_error" IS NOT NULL THEN 'INSUFFICIENT_DATA'
  ELSE 'NORMAL'
END;
