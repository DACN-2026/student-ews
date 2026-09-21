ALTER TABLE "graduation_evaluation_students"
  ADD COLUMN "needs_manual_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "grade_snapshot" JSONB NOT NULL DEFAULT '[]';
