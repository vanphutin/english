CREATE TABLE "unit_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "policy_version" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    CONSTRAINT "unit_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unit_challenge_targets" (
    "challenge_id" UUID NOT NULL,
    "grammar_point_id" UUID NOT NULL,
    "grammar_code" TEXT NOT NULL,
    "grammar_title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "unit_challenge_targets_pkey" PRIMARY KEY ("challenge_id", "grammar_point_id")
);

CREATE UNIQUE INDEX "unit_challenges_session_id_key" ON "unit_challenges"("session_id");
CREATE INDEX "unit_challenges_user_id_started_at_idx" ON "unit_challenges"("user_id", "started_at" DESC);
CREATE INDEX "unit_challenges_unit_id_idx" ON "unit_challenges"("unit_id");
CREATE INDEX "unit_challenge_targets_grammar_point_id_idx" ON "unit_challenge_targets"("grammar_point_id");

ALTER TABLE "unit_challenges" ADD CONSTRAINT "unit_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unit_challenges" ADD CONSTRAINT "unit_challenges_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "curriculum_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unit_challenges" ADD CONSTRAINT "unit_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unit_challenge_targets" ADD CONSTRAINT "unit_challenge_targets_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "unit_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_challenge_targets" ADD CONSTRAINT "unit_challenge_targets_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
