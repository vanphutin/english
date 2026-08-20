CREATE TABLE "learner_error_patterns" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "grammar_point_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "occurrence_count" INTEGER NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "last_success_at" TIMESTAMPTZ,
    "representative_attempt_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learner_error_patterns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learner_error_patterns_state_check" CHECK ("state" IN ('ACTIVE', 'IMPROVING', 'RESOLVED', 'RECURRED')),
    CONSTRAINT "learner_error_patterns_occurrence_count_check" CHECK ("occurrence_count" > 0),
    CONSTRAINT "learner_error_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
    CONSTRAINT "learner_error_patterns_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT,
    CONSTRAINT "learner_error_patterns_representative_attempt_id_fkey" FOREIGN KEY ("representative_attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "learner_error_patterns_user_id_grammar_point_id_category_code_key"
ON "learner_error_patterns"("user_id", "grammar_point_id", "category", "code");

CREATE INDEX "learner_error_patterns_user_id_state_last_seen_at_idx"
ON "learner_error_patterns"("user_id", "state", "last_seen_at" DESC);
