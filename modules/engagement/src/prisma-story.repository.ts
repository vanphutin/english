import type { Prisma, PrismaClient } from '@prisma/client';
import { mergeStoryFacts, sanitizeStoryFacts } from './story-policy.js';
import type { StoryJourneyView, StoryRepository, StorySceneView } from './story-types.js';

export class PrismaStoryRepository implements StoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getJourney(userId: string): Promise<StoryJourneyView | null> {
    const series = await this.prisma.storySeries.findFirst({
      where: { status: 'PUBLISHED', cefrLevel: 'A1' },
      orderBy: [{ versionNo: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        chapters: {
          orderBy: { sortOrder: 'asc' },
          select: { scenes: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } } },
        },
      },
    });
    const firstSceneId = series?.chapters.flatMap((chapter) => chapter.scenes)[0]?.id;
    if (!series || !firstSceneId) return null;
    await this.prisma.userStoryProgress.upsert({
      where: { userId_seriesId: { userId, seriesId: series.id } },
      create: { userId, seriesId: series.id, currentSceneId: firstSceneId },
      update: {},
    });
    return this.loadJourney(userId, series.id);
  }

  async chooseBranch(
    userId: string,
    sceneId: string,
    choiceId: string,
    idempotencyKey: string,
  ): Promise<StoryJourneyView | null> {
    const seriesId = await this.prisma.$transaction(async (tx) => {
      const progress = await tx.userStoryProgress.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, seriesId: true, currentSceneId: true, memoryFactsJson: true },
      });
      if (!progress || progress.currentSceneId !== sceneId)
        throw new Error('STORY_SCENE_NOT_CURRENT');
      const replay = await tx.userStoryChoice.findUnique({
        where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey } },
        select: { choiceId: true },
      });
      if (replay) {
        if (replay.choiceId !== choiceId) throw new Error('IDEMPOTENCY_KEY_REUSED');
        return progress.seriesId;
      }
      const choice = await tx.storyChoice.findFirst({
        where: { id: choiceId, sceneId },
        select: {
          id: true,
          nextSceneId: true,
          memoryFactsJson: true,
          scene: { select: { memoryFactsJson: true } },
        },
      });
      if (!choice) throw new Error('STORY_CHOICE_NOT_FOUND');
      await tx.userStoryChoice.create({
        data: { progressId: progress.id, sceneId, choiceId, idempotencyKey },
      });
      await tx.userStorySceneCompletion.upsert({
        where: { progressId_sceneId: { progressId: progress.id, sceneId } },
        create: { progressId: progress.id, sceneId, idempotencyKey: `${idempotencyKey}:scene` },
        update: {},
      });
      await tx.userStoryProgress.update({
        where: { id: progress.id },
        data: {
          currentSceneId: choice.nextSceneId,
          memoryFactsJson: mergeStoryFacts(progress.memoryFactsJson, [
            ...sanitizeStoryFacts(choice.scene.memoryFactsJson),
            ...sanitizeStoryFacts(choice.memoryFactsJson),
          ]) as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      return progress.seriesId;
    });
    return this.loadJourney(userId, seriesId);
  }

  async continueScene(
    userId: string,
    sceneId: string,
    idempotencyKey: string,
  ): Promise<StoryJourneyView | null> {
    const seriesId = await this.prisma.$transaction(async (tx) => {
      const progress = await tx.userStoryProgress.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, seriesId: true, currentSceneId: true, memoryFactsJson: true },
      });
      if (!progress || progress.currentSceneId !== sceneId)
        throw new Error('STORY_SCENE_NOT_CURRENT');
      const scene = await tx.storyScene.findUnique({
        where: { id: sceneId },
        select: { defaultNextSceneId: true, memoryFactsJson: true, choices: { take: 1 } },
      });
      if (!scene) throw new Error('STORY_SCENE_NOT_FOUND');
      if (scene.choices.length) throw new Error('STORY_CHOICE_REQUIRED');
      const existing = await tx.userStorySceneCompletion.findUnique({
        where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey } },
      });
      if (existing) return progress.seriesId;
      await tx.userStorySceneCompletion.create({
        data: { progressId: progress.id, sceneId, idempotencyKey },
      });
      await tx.userStoryProgress.update({
        where: { id: progress.id },
        data: {
          currentSceneId: scene.defaultNextSceneId,
          status: scene.defaultNextSceneId ? 'ACTIVE' : 'COMPLETED',
          completedAt: scene.defaultNextSceneId ? null : new Date(),
          memoryFactsJson: mergeStoryFacts(
            progress.memoryFactsJson,
            scene.memoryFactsJson,
          ) as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      return progress.seriesId;
    });
    return this.loadJourney(userId, seriesId);
  }

  async getSceneExercise(userId: string, sceneId: string): Promise<string | null> {
    const progress = await this.prisma.userStoryProgress.findFirst({
      where: { userId, currentSceneId: sceneId, status: 'ACTIVE' },
      select: { currentScene: { select: { exerciseId: true } } },
    });
    return progress?.currentScene?.exerciseId ?? null;
  }

  private async loadJourney(userId: string, seriesId: string): Promise<StoryJourneyView | null> {
    const progress = await this.prisma.userStoryProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: {
        status: true,
        memoryFactsJson: true,
        _count: { select: { completions: true } },
        series: {
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            cefrLevel: true,
            chapters: { select: { _count: { select: { scenes: true } } } },
          },
        },
        currentScene: {
          select: {
            id: true,
            code: true,
            title: true,
            narrativeVi: true,
            dialogueJson: true,
            exerciseId: true,
            defaultNextSceneId: true,
            chapter: { select: { title: true } },
            choices: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, code: true, labelVi: true },
            },
          },
        },
      },
    });
    if (!progress) return null;
    return {
      series: {
        id: progress.series.id,
        code: progress.series.code,
        title: progress.series.title,
        description: progress.series.description,
        cefr: progress.series.cefrLevel,
      },
      status: progress.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      completedSceneCount: progress._count.completions,
      totalSceneCount: progress.series.chapters.reduce(
        (sum, chapter) => sum + chapter._count.scenes,
        0,
      ),
      currentScene: progress.currentScene ? this.mapScene(progress.currentScene) : null,
      memoryFacts: sanitizeStoryFacts(progress.memoryFactsJson),
    };
  }

  private mapScene(scene: {
    id: string;
    code: string;
    title: string;
    narrativeVi: string;
    dialogueJson: unknown;
    exerciseId: string | null;
    defaultNextSceneId: string | null;
    chapter: { title: string };
    choices: Array<{ id: string; code: string; labelVi: string }>;
  }): StorySceneView {
    const dialogue = Array.isArray(scene.dialogueJson)
      ? scene.dialogueJson.flatMap((line) => {
          if (!line || typeof line !== 'object') return [];
          const item = line as Record<string, unknown>;
          return typeof item.speaker === 'string' && typeof item.text === 'string'
            ? [{ speaker: item.speaker, text: item.text }]
            : [];
        })
      : [];
    return {
      id: scene.id,
      code: scene.code,
      chapterTitle: scene.chapter.title,
      title: scene.title,
      narrativeVi: scene.narrativeVi,
      dialogue,
      choices: scene.choices,
      hasDefaultContinuation: Boolean(scene.defaultNextSceneId) || scene.choices.length === 0,
      hasLearningAction: Boolean(scene.exerciseId),
      exerciseId: scene.exerciseId,
    };
  }
}
