-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('PREREQUISITE', 'CONTRASTS_WITH', 'BUILDS_ON', 'OFTEN_CONFUSED_WITH', 'PART_OF');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('SUBMITTED', 'EVALUATING', 'EVALUATED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('ACCEPT', 'ACCEPT_WITH_FEEDBACK', 'RETRY', 'SYSTEM_REVIEW');

-- CreateEnum
CREATE TYPE "MasteryBand" AS ENUM ('UNSEEN', 'LEARNING', 'PRACTICING', 'MASTERED', 'REVIEW_DUE', 'AT_RISK');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "native_locale" TEXT NOT NULL DEFAULT 'vi',
    "target_locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Saigon',
    "preferences_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "grammar_points" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "family_code" TEXT NOT NULL,
    "canonical_slug" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "grammar_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_point_versions" (
    "id" UUID NOT NULL,
    "grammar_point_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "cefr_level" "CefrLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "form_summary" TEXT NOT NULL,
    "meaning_summary" TEXT NOT NULL,
    "usage_notes" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_point_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_relationships" (
    "id" UUID NOT NULL,
    "source_point_id" UUID NOT NULL,
    "target_point_id" UUID NOT NULL,
    "relationship_type" "RelationshipType" NOT NULL,
    "rationale" TEXT,
    "strength" DECIMAL(3,2),
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "grammar_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_rules" (
    "id" UUID NOT NULL,
    "grammar_point_version_id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pattern_json" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grammar_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_examples" (
    "id" UUID NOT NULL,
    "grammar_point_version_id" UUID NOT NULL,
    "example_type" TEXT NOT NULL,
    "english_text" TEXT NOT NULL,
    "vietnamese_text" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grammar_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_patterns" (
    "id" UUID NOT NULL,
    "grammar_point_version_id" UUID NOT NULL,
    "error_code" TEXT NOT NULL,
    "incorrect_pattern" TEXT NOT NULL,
    "corrected_pattern" TEXT NOT NULL,
    "explanation_vi" TEXT NOT NULL,
    "detection_hint_json" JSONB NOT NULL DEFAULT '{}',
    "severity" TEXT NOT NULL,

    CONSTRAINT "error_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience_json" JSONB NOT NULL DEFAULT '{}',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_releases" (
    "id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "content_hash" TEXT NOT NULL,

    CONSTRAINT "curriculum_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_levels" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "cefr_level" "CefrLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "unlock_policy_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "curriculum_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_items" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "grammar_point_version_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "minimum_evidence_count" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "curriculum_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_curriculum_enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "current_level_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "user_curriculum_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_progress" (
    "user_id" UUID NOT NULL,
    "curriculum_level_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "progress_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "policy_version" TEXT NOT NULL,

    CONSTRAINT "level_progress_pkey" PRIMARY KEY ("user_id","curriculum_level_id")
);

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "plan_policy_version" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "summary_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content_status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "generator_version" TEXT NOT NULL,
    "evaluator_rubric_version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "difficulty" INTEGER NOT NULL,
    "prompt_context_vi" TEXT NOT NULL,
    "instruction_vi" TEXT NOT NULL,
    "constraints_json" JSONB NOT NULL DEFAULT '{}',
    "content_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_targets" (
    "exercise_id" UUID NOT NULL,
    "grammar_point_version_id" UUID NOT NULL,
    "target_role" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,

    CONSTRAINT "exercise_targets_pkey" PRIMARY KEY ("exercise_id","grammar_point_version_id","target_role")
);

-- CreateTable
CREATE TABLE "exercise_sentences" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source_text_vi" TEXT NOT NULL,
    "reference_answers_json" JSONB NOT NULL,
    "semantic_requirements_json" JSONB NOT NULL,

    CONSTRAINT "exercise_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_items" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "selection_reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "presented_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "session_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "answer_text" TEXT NOT NULL,
    "normalized_answer" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'SUBMITTED',
    "idempotency_key" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_at" TIMESTAMPTZ,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "evaluator_version" TEXT NOT NULL,
    "rubric_version" TEXT NOT NULL,
    "disposition" "Disposition" NOT NULL,
    "target_used" BOOLEAN NOT NULL,
    "meaning_preserved" BOOLEAN NOT NULL,
    "overall_score" DECIMAL(5,2) NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "feedback_vi" TEXT NOT NULL,
    "corrected_answer" TEXT,
    "is_effective" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" UUID,
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "grammar_point_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "evidence_weight" DECIMAL(5,3) NOT NULL,
    "score_delta" DECIMAL(6,3) NOT NULL,
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_grammar_mastery" (
    "user_id" UUID NOT NULL,
    "grammar_point_id" UUID NOT NULL,
    "band" "MasteryBand" NOT NULL DEFAULT 'UNSEEN',
    "mastery_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "retention_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "independent_success_count" INTEGER NOT NULL DEFAULT 0,
    "assisted_success_count" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "last_practiced_at" TIMESTAMPTZ,
    "next_review_at" TIMESTAMPTZ,
    "last_event_id" UUID,
    "projection_version" TEXT NOT NULL,

    CONSTRAINT "user_grammar_mastery_pkey" PRIMARY KEY ("user_id","grammar_point_id")
);

-- CreateTable
CREATE TABLE "evaluation_findings" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message_vi" TEXT NOT NULL,
    "evidence_span_json" JSONB,
    "suggested_fix" TEXT,
    "grammar_point_id" UUID,
    "attemptId" UUID,

    CONSTRAINT "evaluation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_template_version" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_schema_version" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost" DECIMAL(12,6),
    "status" TEXT NOT NULL,
    "provider_request_id" TEXT,
    "error_code" TEXT,
    "safe_metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptId" UUID,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_entries" (
    "id" UUID NOT NULL,
    "lemma" TEXT NOT NULL,
    "part_of_speech" TEXT NOT NULL,
    "sense_key" TEXT NOT NULL,
    "definition_vi" TEXT NOT NULL,
    "cefr_level" "CefrLevel",
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "vocabulary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_hints" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "vocabulary_entry_id" UUID NOT NULL,
    "surface_form" TEXT NOT NULL,
    "hint_level" INTEGER NOT NULL,
    "hint_text_vi" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_answer_revealing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vocabulary_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hint_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_item_id" UUID NOT NULL,
    "vocabulary_hint_id" UUID NOT NULL,
    "hint_level" INTEGER NOT NULL,
    "revealed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hint_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "template_hash" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_points_code_key" ON "grammar_points"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_points_canonical_slug_key" ON "grammar_points"("canonical_slug");

-- CreateIndex
CREATE INDEX "grammar_points_family_code_idx" ON "grammar_points"("family_code");

-- CreateIndex
CREATE INDEX "grammar_point_versions_status_cefr_level_idx" ON "grammar_point_versions"("status", "cefr_level");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_point_versions_grammar_point_id_version_no_locale_key" ON "grammar_point_versions"("grammar_point_id", "version_no", "locale");

-- CreateIndex
CREATE INDEX "grammar_relationships_target_point_id_relationship_type_idx" ON "grammar_relationships"("target_point_id", "relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_relationships_source_point_id_target_point_id_relat_key" ON "grammar_relationships"("source_point_id", "target_point_id", "relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_rules_grammar_point_version_id_rule_code_key" ON "grammar_rules"("grammar_point_version_id", "rule_code");

-- CreateIndex
CREATE INDEX "grammar_examples_grammar_point_version_id_sort_order_idx" ON "grammar_examples"("grammar_point_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "error_patterns_grammar_point_version_id_error_code_key" ON "error_patterns"("grammar_point_version_id", "error_code");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_code_key" ON "curricula"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_releases_curriculum_id_version_no_key" ON "curriculum_releases"("curriculum_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_levels_release_id_code_key" ON "curriculum_levels"("release_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_levels_release_id_sort_order_key" ON "curriculum_levels"("release_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_level_id_code_key" ON "curriculum_units"("level_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_level_id_sort_order_key" ON "curriculum_units"("level_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_items_unit_id_grammar_point_version_id_role_key" ON "curriculum_items"("unit_id", "grammar_point_version_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_items_unit_id_sort_order_key" ON "curriculum_items"("unit_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_curriculum_enrollments_user_id_release_id_key" ON "user_curriculum_enrollments"("user_id", "release_id");

-- CreateIndex
CREATE INDEX "learning_sessions_user_id_started_at_idx" ON "learning_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_sentences_exercise_id_position_key" ON "exercise_sentences"("exercise_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "session_items_session_id_position_key" ON "session_items"("session_id", "position");

-- CreateIndex
CREATE INDEX "attempts_user_id_submitted_at_idx" ON "attempts"("user_id", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attempts_user_id_idempotency_key_key" ON "attempts"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_session_item_id_attempt_no_key" ON "attempts"("session_item_id", "attempt_no");

-- CreateIndex
CREATE INDEX "evaluations_attempt_id_is_effective_idx" ON "evaluations"("attempt_id", "is_effective");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_events_idempotency_key_key" ON "mastery_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "mastery_events_user_id_grammar_point_id_occurred_at_idx" ON "mastery_events"("user_id", "grammar_point_id", "occurred_at");

-- CreateIndex
CREATE INDEX "user_grammar_mastery_user_id_next_review_at_idx" ON "user_grammar_mastery"("user_id", "next_review_at");

-- CreateIndex
CREATE INDEX "evaluation_findings_evaluation_id_severity_idx" ON "evaluation_findings"("evaluation_id", "severity");

-- CreateIndex
CREATE INDEX "ai_calls_provider_model_created_at_idx" ON "ai_calls"("provider", "model", "created_at");

-- CreateIndex
CREATE INDEX "ai_calls_status_created_at_idx" ON "ai_calls"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_entries_sense_key_key" ON "vocabulary_entries"("sense_key");

-- CreateIndex
CREATE INDEX "vocabulary_entries_lemma_part_of_speech_idx" ON "vocabulary_entries"("lemma", "part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_hints_exercise_id_position_hint_level_key" ON "vocabulary_hints"("exercise_id", "position", "hint_level");

-- CreateIndex
CREATE UNIQUE INDEX "hint_events_user_id_session_item_id_vocabulary_hint_id_hint_key" ON "hint_events"("user_id", "session_item_id", "vocabulary_hint_id", "hint_level");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_purpose_version_key" ON "prompt_templates"("purpose", "version");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_occurred_at_idx" ON "outbox_events"("published_at", "occurred_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_point_versions" ADD CONSTRAINT "grammar_point_versions_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_relationships" ADD CONSTRAINT "grammar_relationships_source_point_id_fkey" FOREIGN KEY ("source_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_relationships" ADD CONSTRAINT "grammar_relationships_target_point_id_fkey" FOREIGN KEY ("target_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_rules" ADD CONSTRAINT "grammar_rules_grammar_point_version_id_fkey" FOREIGN KEY ("grammar_point_version_id") REFERENCES "grammar_point_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_examples" ADD CONSTRAINT "grammar_examples_grammar_point_version_id_fkey" FOREIGN KEY ("grammar_point_version_id") REFERENCES "grammar_point_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_patterns" ADD CONSTRAINT "error_patterns_grammar_point_version_id_fkey" FOREIGN KEY ("grammar_point_version_id") REFERENCES "grammar_point_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_releases" ADD CONSTRAINT "curriculum_releases_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_levels" ADD CONSTRAINT "curriculum_levels_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "curriculum_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "curriculum_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_items" ADD CONSTRAINT "curriculum_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "curriculum_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_items" ADD CONSTRAINT "curriculum_items_grammar_point_version_id_fkey" FOREIGN KEY ("grammar_point_version_id") REFERENCES "grammar_point_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_curriculum_enrollments" ADD CONSTRAINT "user_curriculum_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_curriculum_enrollments" ADD CONSTRAINT "user_curriculum_enrollments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "curriculum_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_curriculum_enrollments" ADD CONSTRAINT "user_curriculum_enrollments_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "curriculum_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_curriculum_level_id_fkey" FOREIGN KEY ("curriculum_level_id") REFERENCES "curriculum_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_targets" ADD CONSTRAINT "exercise_targets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_targets" ADD CONSTRAINT "exercise_targets_grammar_point_version_id_fkey" FOREIGN KEY ("grammar_point_version_id") REFERENCES "grammar_point_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sentences" ADD CONSTRAINT "exercise_sentences_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_item_id_fkey" FOREIGN KEY ("session_item_id") REFERENCES "session_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_events" ADD CONSTRAINT "mastery_events_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_grammar_mastery" ADD CONSTRAINT "user_grammar_mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_grammar_mastery" ADD CONSTRAINT "user_grammar_mastery_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_findings" ADD CONSTRAINT "evaluation_findings_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_findings" ADD CONSTRAINT "evaluation_findings_grammar_point_id_fkey" FOREIGN KEY ("grammar_point_id") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_findings" ADD CONSTRAINT "evaluation_findings_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_hints" ADD CONSTRAINT "vocabulary_hints_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_hints" ADD CONSTRAINT "vocabulary_hints_vocabulary_entry_id_fkey" FOREIGN KEY ("vocabulary_entry_id") REFERENCES "vocabulary_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_session_item_id_fkey" FOREIGN KEY ("session_item_id") REFERENCES "session_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_vocabulary_hint_id_fkey" FOREIGN KEY ("vocabulary_hint_id") REFERENCES "vocabulary_hints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
