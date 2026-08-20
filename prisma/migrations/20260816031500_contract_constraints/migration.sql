-- PostgreSQL constraints that Prisma cannot currently represent in schema.prisma.
-- This forward migration preserves domain invariants at the database boundary.

ALTER TABLE "grammar_relationships"
  ADD CONSTRAINT "grammar_relationships_no_self_edge"
  CHECK ("source_point_id" <> "target_point_id");

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_score_range"
  CHECK ("overall_score" >= 0 AND "overall_score" <= 100),
  ADD CONSTRAINT "evaluations_confidence_range"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);

CREATE UNIQUE INDEX "evaluations_one_effective_per_attempt"
  ON "evaluations" ("attempt_id")
  WHERE "is_effective" = true;

ALTER TABLE "user_grammar_mastery"
  ADD CONSTRAINT "mastery_score_range"
  CHECK ("mastery_score" >= 0 AND "mastery_score" <= 100),
  ADD CONSTRAINT "retention_score_range"
  CHECK ("retention_score" >= 0 AND "retention_score" <= 100),
  ADD CONSTRAINT "mastery_confidence_range"
  CHECK ("confidence" >= 0 AND "confidence" <= 1),
  ADD CONSTRAINT "mastery_counts_non_negative"
  CHECK (
    "evidence_count" >= 0 AND
    "independent_success_count" >= 0 AND
    "assisted_success_count" >= 0 AND
    "current_streak" >= 0
  );

CREATE INDEX "user_grammar_mastery_due_review"
  ON "user_grammar_mastery" ("user_id", "next_review_at")
  WHERE "next_review_at" IS NOT NULL;

CREATE INDEX "outbox_events_unpublished"
  ON "outbox_events" ("occurred_at")
  WHERE "published_at" IS NULL;

