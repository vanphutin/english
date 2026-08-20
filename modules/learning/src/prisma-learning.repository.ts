import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  applyMasteryEvidence,
  MASTERY_POLICY_VERSION,
  type MasteryState,
} from './mastery-policy.js';
import type { LearningRepository, MasteryView, ProgressView } from './types.js';
import { evaluateLevelProgression, PROGRESSION_POLICY_VERSION } from './progression-policy.js';

const numeric = (value: Prisma.Decimal | number): number => Number(value);

export class PrismaLearningRepository implements LearningRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Records each effective evaluation once per primary target and advances its projection in the
   * same transaction. The event key makes retries safe; SYSTEM_REVIEW is retained as zero-weight
   * audit evidence and cannot change learner mastery.
   */
  async recordEvaluationEvidence(userId: string, attemptId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const attempt = await tx.attempt.findFirst({
          where: { id: attemptId, userId },
          select: {
            id: true,
            attemptNo: true,
            sessionItem: {
              select: {
                sessionId: true,
                hintEvents: { where: { userId }, take: 1, select: { id: true } },
              },
            },
            exercise: {
              select: {
                targets: {
                  where: { targetRole: 'PRIMARY' },
                  select: {
                    grammarPointVersion: { select: { grammarPointId: true } },
                  },
                },
              },
            },
            evaluations: {
              where: { isEffective: true },
              take: 1,
              select: { id: true, disposition: true, completedAt: true },
            },
          },
        });
        const evaluation = attempt?.evaluations[0];
        if (!attempt || !evaluation) throw new Error('EFFECTIVE_EVALUATION_NOT_FOUND');

        for (const target of attempt.exercise.targets) {
          const grammarPointId = target.grammarPointVersion.grammarPointId;
          const idempotencyKey = `${evaluation.id}:${grammarPointId}:${MASTERY_POLICY_VERSION}`;
          const existingEvent = await tx.masteryEvent.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          });
          if (existingEvent) continue;

          const projection = await tx.userGrammarMastery.findUnique({
            where: { userId_grammarPointId: { userId, grammarPointId } },
          });
          const priorSessionEvent = await tx.masteryEvent.findFirst({
            where: {
              userId,
              grammarPointId,
              attempt: { sessionItem: { sessionId: attempt.sessionItem.sessionId } },
            },
            select: { id: true },
          });
          const current: MasteryState = projection
            ? {
                band: projection.band,
                masteryScore: numeric(projection.masteryScore),
                retentionScore: numeric(projection.retentionScore),
                confidence: numeric(projection.confidence),
                evidenceCount: projection.evidenceCount,
                independentSuccessCount: projection.independentSuccessCount,
                assistedSuccessCount: projection.assistedSuccessCount,
                distinctSessionCount: projection.distinctSessionCount,
                currentStreak: projection.currentStreak,
              }
            : {
                band: 'UNSEEN',
                masteryScore: 0,
                retentionScore: 0,
                confidence: 0,
                evidenceCount: 0,
                independentSuccessCount: 0,
                assistedSuccessCount: 0,
                distinctSessionCount: 0,
                currentStreak: 0,
              };
          const update = applyMasteryEvidence(current, {
            disposition: evaluation.disposition,
            attemptNo: attempt.attemptNo,
            usedHint: attempt.sessionItem.hintEvents.length > 0,
            occurredAt: evaluation.completedAt,
            priorSessionAlreadyCounted: Boolean(priorSessionEvent),
          });
          const event = await tx.masteryEvent.create({
            data: {
              userId,
              grammarPointId,
              attemptId: attempt.id,
              evaluationId: evaluation.id,
              policyVersion: MASTERY_POLICY_VERSION,
              evidenceType: update.evidenceType,
              evidenceWeight: update.evidenceWeight,
              scoreDelta: update.scoreDelta,
              reasonCodes: update.reasonCodes,
              idempotencyKey,
              occurredAt: evaluation.completedAt,
            },
            select: { id: true },
          });
          await tx.userGrammarMastery.upsert({
            where: { userId_grammarPointId: { userId, grammarPointId } },
            create: {
              userId,
              grammarPointId,
              band: update.band,
              masteryScore: update.masteryScore,
              retentionScore: update.retentionScore,
              confidence: update.confidence,
              evidenceCount: update.evidenceCount,
              independentSuccessCount: update.independentSuccessCount,
              assistedSuccessCount: update.assistedSuccessCount,
              distinctSessionCount: update.distinctSessionCount,
              currentStreak: update.currentStreak,
              lastPracticedAt: evaluation.completedAt,
              nextReviewAt: update.nextReviewAt,
              lastEventId: event.id,
              projectionVersion: MASTERY_POLICY_VERSION,
            },
            update: {
              band: update.band,
              masteryScore: update.masteryScore,
              retentionScore: update.retentionScore,
              confidence: update.confidence,
              evidenceCount: update.evidenceCount,
              independentSuccessCount: update.independentSuccessCount,
              assistedSuccessCount: update.assistedSuccessCount,
              distinctSessionCount: update.distinctSessionCount,
              currentStreak: update.currentStreak,
              lastPracticedAt: evaluation.completedAt,
              nextReviewAt: update.nextReviewAt,
              lastEventId: event.id,
              projectionVersion: MASTERY_POLICY_VERSION,
            },
          });
        }
        await this.refreshLevelProgression(tx, userId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Recomputes current-level progression from authoritative projections after new evidence. */
  private async refreshLevelProgression(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const enrollment = await tx.userCurriculumEnrollment.findFirst({
      where: { userId, status: 'ACTIVE', currentLevelId: { not: null } },
      orderBy: { enrolledAt: 'desc' },
      select: {
        id: true,
        currentLevelId: true,
        release: {
          select: {
            levels: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                units: {
                  select: {
                    items: {
                      where: { role: 'REQUIRED' },
                      select: {
                        minimumEvidenceCount: true,
                        grammarPointVersion: { select: { grammarPointId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!enrollment?.currentLevelId) return;
    const levelIndex = enrollment.release.levels.findIndex(
      (level) => level.id === enrollment.currentLevelId,
    );
    const level = enrollment.release.levels[levelIndex];
    if (!level) return;
    const requiredItems = level.units.flatMap((unit) => unit.items);
    const requiredIds = [
      ...new Set(requiredItems.map((item) => item.grammarPointVersion.grammarPointId)),
    ];
    const [mastery, prerequisites, attempts] = await Promise.all([
      tx.userGrammarMastery.findMany({
        where: { userId, grammarPointId: { in: requiredIds } },
        select: {
          grammarPointId: true,
          band: true,
          masteryScore: true,
          evidenceCount: true,
          distinctSessionCount: true,
        },
      }),
      tx.grammarRelationship.findMany({
        where: {
          targetPointId: { in: requiredIds },
          relationshipType: 'PREREQUISITE',
          status: 'PUBLISHED',
        },
        select: { sourcePointId: true },
      }),
      tx.attempt.findMany({
        where: {
          userId,
          exercise: {
            targets: { some: { grammarPointVersion: { grammarPointId: { in: requiredIds } } } },
          },
        },
        select: {
          evaluations: { where: { isEffective: true }, take: 1, select: { disposition: true } },
        },
      }),
    ]);
    const prerequisiteIds = [...new Set(prerequisites.map((item) => item.sourcePointId))];
    const prerequisiteMastery = prerequisiteIds.length
      ? await tx.userGrammarMastery.findMany({
          where: {
            userId,
            grammarPointId: { in: prerequisiteIds },
            band: { in: ['MASTERED', 'REVIEW_DUE'] },
          },
          select: { grammarPointId: true },
        })
      : [];
    const masteryByPoint = new Map(mastery.map((item) => [item.grammarPointId, item]));
    const decision = evaluateLevelProgression({
      requiredScores: requiredIds.map((id) => Number(masteryByPoint.get(id)?.masteryScore ?? 0)),
      masteredCount: requiredIds.filter((id) =>
        ['MASTERED', 'REVIEW_DUE'].includes(masteryByPoint.get(id)?.band ?? ''),
      ).length,
      allHardPrerequisitesMastered: prerequisiteMastery.length === prerequisiteIds.length,
      mixedPracticeAccepted: attempts.filter((item) =>
        ['ACCEPT', 'ACCEPT_WITH_FEEDBACK'].includes(item.evaluations[0]?.disposition ?? ''),
      ).length,
      mixedPracticeTotal: attempts.filter((item) => item.evaluations.length > 0).length,
      hasDelayedReviewSuccess: requiredIds.some(
        (id) => (masteryByPoint.get(id)?.distinctSessionCount ?? 0) >= 2,
      ),
    });
    await tx.levelProgress.upsert({
      where: { userId_curriculumLevelId: { userId, curriculumLevelId: level.id } },
      create: {
        userId,
        curriculumLevelId: level.id,
        status: decision.eligible ? 'COMPLETED' : 'IN_PROGRESS',
        progressScore: decision.progressScore,
        policyVersion: PROGRESSION_POLICY_VERSION,
        unlockedAt: new Date(),
        ...(decision.eligible ? { completedAt: new Date() } : {}),
      },
      update: {
        status: decision.eligible ? 'COMPLETED' : 'IN_PROGRESS',
        progressScore: decision.progressScore,
        policyVersion: PROGRESSION_POLICY_VERSION,
        ...(decision.eligible ? { completedAt: new Date() } : {}),
      },
    });
    if (!decision.eligible) return;
    const nextLevel = enrollment.release.levels[levelIndex + 1];
    if (!nextLevel) {
      await tx.userCurriculumEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return;
    }
    const nextProgress = await tx.levelProgress.findUnique({
      where: { userId_curriculumLevelId: { userId, curriculumLevelId: nextLevel.id } },
      select: { unlockedAt: true },
    });
    await tx.levelProgress.upsert({
      where: { userId_curriculumLevelId: { userId, curriculumLevelId: nextLevel.id } },
      create: {
        userId,
        curriculumLevelId: nextLevel.id,
        status: 'IN_PROGRESS',
        progressScore: 0,
        policyVersion: PROGRESSION_POLICY_VERSION,
        unlockedAt: new Date(),
      },
      update: {
        status: 'IN_PROGRESS',
        policyVersion: PROGRESSION_POLICY_VERSION,
        unlockedAt: nextProgress?.unlockedAt ?? new Date(),
      },
    });
    await tx.userCurriculumEnrollment.update({
      where: { id: enrollment.id },
      data: { currentLevelId: nextLevel.id },
    });
    if (!nextProgress?.unlockedAt)
      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          actorId: userId,
          action: 'LEVEL_UNLOCKED',
          entityType: 'CURRICULUM_LEVEL',
          entityId: nextLevel.id,
          metadataJson: { policyVersion: PROGRESSION_POLICY_VERSION, previousLevelId: level.id },
        },
      });
  }

  async listMastery(userId: string, dueBefore?: Date): Promise<MasteryView[]> {
    const records = await this.prisma.userGrammarMastery.findMany({
      where: { userId, ...(dueBefore ? { nextReviewAt: { lte: dueBefore } } : {}) },
      orderBy: [{ nextReviewAt: 'asc' }, { grammarPointId: 'asc' }],
      take: 100,
      select: {
        grammarPointId: true,
        band: true,
        masteryScore: true,
        retentionScore: true,
        confidence: true,
        evidenceCount: true,
        nextReviewAt: true,
        grammarPoint: {
          select: {
            code: true,
            versions: {
              where: { status: 'PUBLISHED' },
              orderBy: { versionNo: 'desc' },
              take: 1,
              select: { title: true },
            },
          },
        },
      },
    });
    return records.map((record) => ({
      grammarPointId: record.grammarPointId,
      code: record.grammarPoint.code,
      title: record.grammarPoint.versions[0]?.title ?? record.grammarPoint.code,
      band: record.band,
      masteryScore: numeric(record.masteryScore),
      retentionScore: numeric(record.retentionScore),
      confidence: numeric(record.confidence),
      evidenceCount: record.evidenceCount,
      nextReviewAt: record.nextReviewAt?.toISOString() ?? null,
    }));
  }

  async getProgress(userId: string): Promise<ProgressView | null> {
    const [release, enrollment, activeSession] = await Promise.all([
      this.prisma.curriculumRelease.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          versionNo: true,
          curriculum: { select: { code: true } },
          levels: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              code: true,
              cefrLevel: true,
              title: true,
              units: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  title: true,
                  items: {
                    where: { role: 'REQUIRED' },
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      grammarPointVersion: {
                        select: {
                          title: true,
                          grammarPointId: true,
                          grammarPoint: { select: { code: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.userCurriculumEnrollment.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { enrolledAt: 'desc' },
        select: { releaseId: true, currentLevelId: true },
      }),
      this.prisma.learningSession.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      }),
    ]);
    if (!release || release.levels.length === 0) return null;

    const level =
      enrollment?.releaseId === release.id
        ? (release.levels.find((candidate) => candidate.id === enrollment.currentLevelId) ??
          release.levels[0])
        : release.levels[0];
    if (!level) return null;

    const requiredIds = [
      ...new Set(
        level.units.flatMap((unit) =>
          unit.items.map((item) => item.grammarPointVersion.grammarPointId),
        ),
      ),
    ];
    const mastery = requiredIds.length
      ? await this.prisma.userGrammarMastery.findMany({
          where: { userId, grammarPointId: { in: requiredIds } },
          select: {
            grammarPointId: true,
            band: true,
            masteryScore: true,
            evidenceCount: true,
            nextReviewAt: true,
          },
        })
      : [];
    const now = new Date();
    const masteredPoints = mastery.filter((item) =>
      ['MASTERED', 'REVIEW_DUE'].includes(item.band),
    ).length;
    const learningPoints = mastery.filter((item) => item.evidenceCount > 0).length;
    const dueReviewPoints = mastery.filter(
      (item) => item.band === 'REVIEW_DUE' || (item.nextReviewAt && item.nextReviewAt <= now),
    ).length;
    const progressPercent = requiredIds.length
      ? Math.round(
          mastery.reduce((sum, item) => sum + numeric(item.masteryScore), 0) / requiredIds.length,
        )
      : 0;
    const currentIndex = release.levels.findIndex((candidate) => candidate.id === level.id);

    return {
      curriculum: { code: release.curriculum.code, version: release.versionNo },
      currentLevel: {
        id: level.id,
        code: level.code,
        cefr: level.cefrLevel,
        title: level.title,
      },
      requiredPoints: requiredIds.length,
      masteredPoints,
      learningPoints,
      unseenPoints: Math.max(0, requiredIds.length - learningPoints),
      dueReviewPoints,
      progressPercent,
      roadmap: release.levels.map((roadmapLevel, index) => ({
        id: roadmapLevel.id,
        code: roadmapLevel.code,
        cefr: roadmapLevel.cefrLevel,
        title: roadmapLevel.title,
        status: index < currentIndex ? 'COMPLETED' : index === currentIndex ? 'CURRENT' : 'LOCKED',
        progressPercent: index < currentIndex ? 100 : index === currentIndex ? progressPercent : 0,
        units: roadmapLevel.units.map((unit) => ({
          id: unit.id,
          title: unit.title,
          grammarPoints: unit.items.map((item) => ({
            code: item.grammarPointVersion.grammarPoint.code,
            title: item.grammarPointVersion.title,
          })),
        })),
      })),
      nextAction: activeSession
        ? { type: 'RESUME_SESSION', sessionId: activeSession.id }
        : dueReviewPoints > 0
          ? { type: 'START_REVIEW' }
          : { type: 'START_DAILY' },
    };
  }
}
