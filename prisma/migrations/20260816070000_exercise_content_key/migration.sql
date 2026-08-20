ALTER TABLE "exercises"
ADD COLUMN "content_key" TEXT;

UPDATE "exercises"
SET "content_key" = 'legacy-' || "id"::text
WHERE "content_key" IS NULL;

ALTER TABLE "exercises"
ALTER COLUMN "content_key" SET NOT NULL;

CREATE UNIQUE INDEX "exercises_content_key_key"
ON "exercises"("content_key");
