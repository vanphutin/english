ALTER TABLE "attempts"
ADD COLUMN "request_hash" TEXT;

UPDATE "attempts"
SET "request_hash" = encode(sha256(("idempotency_key" || ':' || "answer_text")::bytea), 'hex')
WHERE "request_hash" IS NULL;

ALTER TABLE "attempts"
ALTER COLUMN "request_hash" SET NOT NULL;

ALTER TABLE "evaluations"
ADD COLUMN "dimensions_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "accepted_alternative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "uncertainty_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
