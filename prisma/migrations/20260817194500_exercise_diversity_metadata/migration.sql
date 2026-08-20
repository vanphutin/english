ALTER TABLE "exercises"
ADD COLUMN "semantic_hash" TEXT,
ADD COLUMN "topic_code" TEXT NOT NULL DEFAULT 'DAILY_LIFE';

-- Existing curated rows each represent a distinct meaning. Future activity variants deliberately
-- reuse their base row's semantic hash so the session planner cannot show equivalent prompts twice.
UPDATE "exercises"
SET "semantic_hash" = md5("content_key") || md5('semantic:' || "content_key")
WHERE "semantic_hash" IS NULL;

ALTER TABLE "exercises" ALTER COLUMN "semantic_hash" SET NOT NULL;

CREATE INDEX "exercises_semantic_hash_idx" ON "exercises"("semantic_hash");
CREATE INDEX "exercises_type_topic_code_idx" ON "exercises"("type", "topic_code");
