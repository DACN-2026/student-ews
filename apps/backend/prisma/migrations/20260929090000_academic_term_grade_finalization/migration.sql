ALTER TABLE "academic_terms"
  ADD COLUMN "grades_finalized_at" TIMESTAMPTZ(6);

COMMENT ON COLUMN "academic_terms"."grades_finalized_at" IS
  'Authoritative timestamp confirming that grades for a MAIN term are finalized and official early-warning evaluation may run.';
