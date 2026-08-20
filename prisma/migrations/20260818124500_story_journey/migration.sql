CREATE TABLE "story_series" (
  "id" UUID NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "cefr_level" "CefrLevel" NOT NULL, "version_no" INTEGER NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT', CONSTRAINT "story_series_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "story_chapters" (
  "id" UUID NOT NULL, "series_id" UUID NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL, CONSTRAINT "story_chapters_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "story_scenes" (
  "id" UUID NOT NULL, "chapter_id" UUID NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
  "narrative_vi" TEXT NOT NULL, "dialogue_json" JSONB NOT NULL DEFAULT '[]', "exercise_id" UUID,
  "default_next_scene_id" UUID, "memory_facts_json" JSONB NOT NULL DEFAULT '[]', "sort_order" INTEGER NOT NULL,
  CONSTRAINT "story_scenes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "story_choices" (
  "id" UUID NOT NULL, "scene_id" UUID NOT NULL, "next_scene_id" UUID NOT NULL, "code" TEXT NOT NULL,
  "label_vi" TEXT NOT NULL, "memory_facts_json" JSONB NOT NULL DEFAULT '[]', "sort_order" INTEGER NOT NULL,
  CONSTRAINT "story_choices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_story_progress" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "series_id" UUID NOT NULL, "current_scene_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "memory_facts_json" JSONB NOT NULL DEFAULT '[]', "version" INTEGER NOT NULL DEFAULT 1,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL, CONSTRAINT "user_story_progress_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_story_choices" (
  "id" UUID NOT NULL, "progress_id" UUID NOT NULL, "scene_id" UUID NOT NULL, "choice_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL, "chosen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_story_choices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_story_scene_completions" (
  "id" UUID NOT NULL, "progress_id" UUID NOT NULL, "scene_id" UUID NOT NULL, "idempotency_key" TEXT NOT NULL,
  "skipped_text" BOOLEAN NOT NULL DEFAULT false, "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_story_scene_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_series_code_key" ON "story_series"("code");
CREATE INDEX "story_series_status_cefr_level_idx" ON "story_series"("status", "cefr_level");
CREATE UNIQUE INDEX "story_chapters_series_id_code_key" ON "story_chapters"("series_id", "code");
CREATE UNIQUE INDEX "story_chapters_series_id_sort_order_key" ON "story_chapters"("series_id", "sort_order");
CREATE UNIQUE INDEX "story_scenes_chapter_id_code_key" ON "story_scenes"("chapter_id", "code");
CREATE UNIQUE INDEX "story_scenes_chapter_id_sort_order_key" ON "story_scenes"("chapter_id", "sort_order");
CREATE INDEX "story_scenes_exercise_id_idx" ON "story_scenes"("exercise_id");
CREATE INDEX "story_scenes_default_next_scene_id_idx" ON "story_scenes"("default_next_scene_id");
CREATE UNIQUE INDEX "story_choices_scene_id_code_key" ON "story_choices"("scene_id", "code");
CREATE UNIQUE INDEX "story_choices_scene_id_sort_order_key" ON "story_choices"("scene_id", "sort_order");
CREATE INDEX "story_choices_next_scene_id_idx" ON "story_choices"("next_scene_id");
CREATE UNIQUE INDEX "user_story_progress_user_id_series_id_key" ON "user_story_progress"("user_id", "series_id");
CREATE INDEX "user_story_progress_current_scene_id_idx" ON "user_story_progress"("current_scene_id");
CREATE UNIQUE INDEX "user_story_choices_progress_id_scene_id_key" ON "user_story_choices"("progress_id", "scene_id");
CREATE UNIQUE INDEX "user_story_choices_progress_id_idempotency_key_key" ON "user_story_choices"("progress_id", "idempotency_key");
CREATE INDEX "user_story_choices_choice_id_idx" ON "user_story_choices"("choice_id");
CREATE UNIQUE INDEX "user_story_scene_completions_progress_id_scene_id_key" ON "user_story_scene_completions"("progress_id", "scene_id");
CREATE UNIQUE INDEX "user_story_scene_completions_progress_id_idempotency_key_key" ON "user_story_scene_completions"("progress_id", "idempotency_key");
CREATE INDEX "user_story_scene_completions_scene_id_idx" ON "user_story_scene_completions"("scene_id");

ALTER TABLE "story_chapters" ADD CONSTRAINT "story_chapters_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "story_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "story_chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_default_next_scene_id_fkey" FOREIGN KEY ("default_next_scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_next_scene_id_fkey" FOREIGN KEY ("next_scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_progress" ADD CONSTRAINT "user_story_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_progress" ADD CONSTRAINT "user_story_progress_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "story_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_progress" ADD CONSTRAINT "user_story_progress_current_scene_id_fkey" FOREIGN KEY ("current_scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_choices" ADD CONSTRAINT "user_story_choices_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "user_story_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_story_choices" ADD CONSTRAINT "user_story_choices_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_choices" ADD CONSTRAINT "user_story_choices_choice_id_fkey" FOREIGN KEY ("choice_id") REFERENCES "story_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_story_scene_completions" ADD CONSTRAINT "user_story_scene_completions_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "user_story_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_story_scene_completions" ADD CONSTRAINT "user_story_scene_completions_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
