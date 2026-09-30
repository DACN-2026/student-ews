ALTER TABLE "warning_actions"
  ADD COLUMN "case_type" VARCHAR(48),
  ADD COLUMN "episode_key" VARCHAR(160),
  ADD COLUMN "source_warning_run_id" UUID,
  ADD COLUMN "source_warning_result_id" UUID,
  ADD COLUMN "latest_warning_run_id" UUID,
  ADD COLUMN "latest_warning_result_id" UUID,
  ADD COLUMN "latest_business_status" VARCHAR(32),
  ADD COLUMN "last_detected_at" TIMESTAMPTZ(6),
  ADD COLUMN "next_follow_up_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "warning_actions_episode_key_key"
  ON "warning_actions"("episode_key");

CREATE UNIQUE INDEX "warning_actions_one_active_early_warning_case_idx"
  ON "warning_actions"("student_id", "case_type")
  WHERE "case_type" = 'EARLY_WARNING_CASE'
    AND "status" IN ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'REOPENED');

CREATE INDEX "warning_actions_case_status_risk_idx"
  ON "warning_actions"("case_type", "status", "latest_business_status");

CREATE TABLE "warning_action_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "warning_action_id" UUID NOT NULL,
  "event_type" VARCHAR(48) NOT NULL,
  "actor_user_id" UUID,
  "system_generated" BOOLEAN NOT NULL DEFAULT false,
  "source_run_id" UUID,
  "idempotency_key" VARCHAR(220),
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "warning_action_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warning_action_events_idempotency_key_key"
  ON "warning_action_events"("idempotency_key");

CREATE INDEX "warning_action_events_case_created_idx"
  ON "warning_action_events"("warning_action_id", "created_at");

CREATE INDEX "warning_action_events_source_run_idx"
  ON "warning_action_events"("source_run_id", "event_type");
