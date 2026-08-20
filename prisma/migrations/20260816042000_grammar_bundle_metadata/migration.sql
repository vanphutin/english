ALTER TABLE "grammar_point_versions"
  ADD COLUMN "learning_objective_en" TEXT NOT NULL,
  ADD COLUMN "provenance_json" JSONB NOT NULL,
  ADD COLUMN "generation_policy_json" JSONB NOT NULL,
  ADD COLUMN "evaluation_policy_json" JSONB NOT NULL;

CREATE INDEX "grammar_point_versions_published_lookup"
  ON "grammar_point_versions" ("grammar_point_id", "version_no" DESC)
  WHERE "status" = 'PUBLISHED';
