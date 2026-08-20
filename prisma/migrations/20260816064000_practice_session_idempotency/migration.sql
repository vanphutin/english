ALTER TABLE "learning_sessions"
  ADD COLUMN "enrollment_id" UUID NOT NULL,
  ADD COLUMN "idempotency_key" TEXT NOT NULL,
  ADD COLUMN "request_hash" TEXT NOT NULL;
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "user_curriculum_enrollments"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "learning_sessions_user_idempotency_key" ON "learning_sessions"("user_id","idempotency_key");
CREATE INDEX "learning_sessions_enrollment_id_idx" ON "learning_sessions"("enrollment_id");
CREATE INDEX "session_items_next_item" ON "session_items"("session_id","position") WHERE "status" IN ('PLANNED','PRESENTED');
