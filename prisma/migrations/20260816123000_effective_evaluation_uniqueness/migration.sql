CREATE UNIQUE INDEX "evaluations_one_effective_per_attempt_idx"
ON "evaluations"("attempt_id")
WHERE "is_effective" = TRUE;
