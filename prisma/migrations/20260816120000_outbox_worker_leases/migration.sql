ALTER TABLE "outbox_events"
ADD COLUMN "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "locked_at" TIMESTAMPTZ,
ADD COLUMN "locked_by" TEXT,
ADD COLUMN "last_error_code" TEXT,
ADD COLUMN "dead_lettered_at" TIMESTAMPTZ;

CREATE INDEX "outbox_events_event_type_published_at_dead_lettered_at_available_at_idx"
ON "outbox_events"("event_type", "published_at", "dead_lettered_at", "available_at");
