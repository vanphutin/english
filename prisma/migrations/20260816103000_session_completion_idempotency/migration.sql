ALTER TABLE "learning_sessions"
ADD COLUMN "completion_idempotency_key" TEXT,
ADD COLUMN "completion_request_hash" TEXT;

CREATE UNIQUE INDEX "learning_sessions_user_id_completion_idempotency_key_key"
ON "learning_sessions"("user_id", "completion_idempotency_key");
