CREATE TABLE "meaningful_learning_days" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "learning_date" DATE NOT NULL, "day_type" TEXT NOT NULL, "evidence_count" INTEGER NOT NULL DEFAULT 0,
  "evidence_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "policy_version" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meaningful_learning_days_pkey" PRIMARY KEY ("user_id", "learning_date")
);
CREATE INDEX "meaningful_learning_days_user_id_learning_date_idx" ON "meaningful_learning_days"("user_id", "learning_date" DESC);

CREATE TABLE "daily_surprises" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "content_key" TEXT NOT NULL, "cefr_level" "CefrLevel" NOT NULL,
  "type" TEXT NOT NULL, "title_vi" TEXT NOT NULL, "body_vi" TEXT NOT NULL, "topic_code" TEXT NOT NULL,
  "policy_version" TEXT NOT NULL, "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT', "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_surprises_pkey" PRIMARY KEY ("id"), CONSTRAINT "daily_surprises_content_key_key" UNIQUE ("content_key")
);
CREATE INDEX "daily_surprises_status_cefr_level_idx" ON "daily_surprises"("status", "cefr_level");

CREATE TABLE "user_daily_surprises" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "surprise_date" DATE NOT NULL,
  "surprise_id" UUID NOT NULL REFERENCES "daily_surprises"("id") ON DELETE RESTRICT, "revealed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_daily_surprises_pkey" PRIMARY KEY ("user_id", "surprise_date")
);
CREATE INDEX "user_daily_surprises_surprise_id_idx" ON "user_daily_surprises"("surprise_id");
