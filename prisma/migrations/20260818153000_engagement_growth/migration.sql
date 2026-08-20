CREATE TABLE "learner_interest_preferences" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_code" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learner_interest_preferences_pkey" PRIMARY KEY ("user_id", "topic_code"),
  CONSTRAINT "learner_interest_preferences_user_id_priority_key" UNIQUE ("user_id", "priority")
);

CREATE TABLE "achievement_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "title_vi" TEXT NOT NULL,
  "description_vi" TEXT NOT NULL, "rule_type" TEXT NOT NULL, "threshold" INTEGER NOT NULL DEFAULT 1,
  "policy_version" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "achievement_definitions_pkey" PRIMARY KEY ("id"), CONSTRAINT "achievement_definitions_code_key" UNIQUE ("code")
);

CREATE TABLE "achievement_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "achievement_definition_id" UUID NOT NULL REFERENCES "achievement_definitions"("id") ON DELETE RESTRICT,
  "evidence_key" TEXT NOT NULL, "evidence_snapshot_json" JSONB NOT NULL, "policy_version" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "achievement_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "achievement_grants_user_id_achievement_definition_id_key" UNIQUE ("user_id", "achievement_definition_id")
);
CREATE INDEX "achievement_grants_achievement_definition_id_idx" ON "achievement_grants"("achievement_definition_id");
CREATE INDEX "achievement_grants_user_id_granted_at_idx" ON "achievement_grants"("user_id", "granted_at" DESC);

CREATE TABLE "weekly_progress_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "week_start" DATE NOT NULL, "week_end" DATE NOT NULL, "policy_version" TEXT NOT NULL, "facts_json" JSONB NOT NULL,
  "presentation_vi" TEXT NOT NULL, "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_progress_reports_pkey" PRIMARY KEY ("id"), CONSTRAINT "weekly_progress_reports_user_id_week_start_key" UNIQUE ("user_id", "week_start")
);
CREATE INDEX "weekly_progress_reports_user_id_generated_at_idx" ON "weekly_progress_reports"("user_id", "generated_at" DESC);
