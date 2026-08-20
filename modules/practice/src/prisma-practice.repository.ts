import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type {
  DailyChoiceView,
  ExerciseView,
  PracticeRepository,
  SessionStateView,
  SessionSummaryView,
  SessionView,
  StartSessionInput,
  VocabularyHintView,
} from './types.js';
import { selectSessionExercises, type SelectionBucket } from './session-selection.js';
export class PrismaPracticeRepository implements PracticeRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async getDailyChoices(userId: string): Promise<DailyChoiceView[]> {
    const weakCount = await this.prisma.userGrammarMastery.count({
      where: {
        userId,
        OR: [{ band: { in: ['AT_RISK', 'REVIEW_DUE', 'LEARNING'] } }, { masteryScore: { lt: 60 } }],
      },
    });
    return [
      {
        type: 'CONTINUE_JOURNEY',
        titleVi: 'Tiếp tục lộ trình',
        descriptionVi: 'Học chủ điểm hiện tại và ôn xen kẽ kiến thức cũ.',
        estimatedMinutes: 10,
        action: { mode: 'DAILY', targetMinutes: 10 },
      },
      {
        type: 'REPAIR_WEAKNESS',
        titleVi: 'Sửa điểm còn yếu',
        descriptionVi:
          weakCount > 0
            ? `Luyện lại ${weakCount} chủ điểm đang yếu hoặc đến hạn ôn.`
            : 'Ôn có chủ đích để giữ kiến thức lâu hơn.',
        estimatedMinutes: 8,
        action: { mode: 'REVIEW', targetMinutes: 8 },
      },
      {
        type: 'QUICK_CHALLENGE',
        titleVi: 'Thử thách nhanh',
        descriptionVi: 'Một lượt ngắn với nhiều dạng câu và ngữ cảnh khác nhau.',
        estimatedMinutes: 6,
        action: { mode: 'DAILY', targetMinutes: 6 },
      },
    ];
  }
  async startSession(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    input: StartSessionInput,
  ): Promise<SessionView> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.learningSession.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          select: { id: true, status: true, sessionType: true, startedAt: true, requestHash: true },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
          return {
            id: existing.id,
            status: existing.status,
            mode: existing.sessionType,
            startedAt: existing.startedAt.toISOString(),
          };
        }
        const release = await tx.curriculumRelease.findFirst({
          where: { status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            levels: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                units: {
                  select: {
                    items: {
                      orderBy: { sortOrder: 'asc' },
                      select: { grammarPointVersionId: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!release || release.levels.length === 0) throw new Error('ACTIVE_CURRICULUM_NOT_FOUND');
        const priorEnrollment = await tx.userCurriculumEnrollment.findUnique({
          where: { userId_releaseId: { userId, releaseId: release.id } },
          select: { currentLevelId: true },
        });
        const level =
          release.levels.find((candidate) => candidate.id === priorEnrollment?.currentLevelId) ??
          release.levels[0];
        if (!level) throw new Error('ACTIVE_CURRICULUM_NOT_FOUND');
        const enrollment = await tx.userCurriculumEnrollment.upsert({
          where: { userId_releaseId: { userId, releaseId: release.id } },
          create: { userId, releaseId: release.id, currentLevelId: level.id },
          update: {},
          select: { id: true },
        });
        const versionIds = level.units.flatMap((unit) =>
          unit.items.map((item) => item.grammarPointVersionId),
        );
        const exerciseCount = Math.max(1, Math.min(10, Math.ceil((input.targetMinutes ?? 10) / 2)));
        const candidateExercises = await tx.exercise.findMany({
          where: {
            contentStatus: 'PUBLISHED',
            ...(input.exerciseIds?.length ? { id: { in: input.exerciseIds } } : {}),
            targets: {
              some: {
                grammarPointVersionId: { in: versionIds },
                ...(input.grammarPointIds?.length
                  ? {
                      grammarPointVersion: {
                        grammarPointId: { in: input.grammarPointIds },
                      },
                    }
                  : {}),
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            semanticHash: true,
            topicCode: true,
            targets: {
              where: { targetRole: 'PRIMARY' },
              take: 1,
              select: { grammarPointVersion: { select: { grammarPointId: true } } },
            },
          },
        });
        const grammarPointIds = candidateExercises.flatMap((exercise) =>
          exercise.targets.map((target) => target.grammarPointVersion.grammarPointId),
        );
        const [mastery, recentItems, interests] = await Promise.all([
          tx.userGrammarMastery.findMany({
            where: { userId, grammarPointId: { in: grammarPointIds } },
            select: { grammarPointId: true, band: true, masteryScore: true, nextReviewAt: true },
          }),
          tx.sessionItem.findMany({
            where: { session: { userId, status: 'COMPLETED' } },
            orderBy: { session: { completedAt: 'desc' } },
            take: 20,
            select: {
              exerciseId: true,
              exercise: { select: { semanticHash: true, topicCode: true } },
            },
          }),
          // Engagement owns writes; Practice consumes this projection as a low-weight ranking signal.
          tx.learnerInterestPreference.findMany({
            where: { userId },
            select: { topicCode: true },
          }),
        ]);
        const masteryByPoint = new Map(mastery.map((item) => [item.grammarPointId, item]));
        const recentIds = new Set(recentItems.map((item) => item.exerciseId));
        const recentSemanticHashes = new Set(recentItems.map((item) => item.exercise.semanticHash));
        const preferredTopics = new Set(interests.map((item) => item.topicCode));
        const now = new Date();
        const exercises = selectSessionExercises(
          candidateExercises.map((exercise) => {
            const grammarPointId = exercise.targets[0]?.grammarPointVersion.grammarPointId;
            const state = grammarPointId ? masteryByPoint.get(grammarPointId) : undefined;
            let bucket: SelectionBucket = 'CURRENT_CURRICULUM';
            if (state?.band === 'REVIEW_DUE' || (state?.nextReviewAt && state.nextReviewAt <= now))
              bucket = 'DUE_REVIEW';
            else if (
              state &&
              (state.band === 'AT_RISK' ||
                state.band === 'LEARNING' ||
                Number(state.masteryScore) < 60)
            )
              bucket = 'WEAK_TARGET';
            return {
              id: exercise.id,
              bucket,
              activityType: exercise.type,
              semanticHash: exercise.semanticHash,
              topicCode: exercise.topicCode,
              preferredTopic: preferredTopics.has(exercise.topicCode),
              ...(grammarPointId ? { groupKey: grammarPointId } : {}),
              recentlyUsed:
                recentIds.has(exercise.id) || recentSemanticHashes.has(exercise.semanticHash),
            };
          }),
          exerciseCount,
          input.mode === 'REVIEW',
          requestHash,
        );
        if (exercises.length === 0) throw new Error('NO_PUBLISHED_EXERCISES');
        const session = await tx.learningSession.create({
          data: {
            userId,
            enrollmentId: enrollment.id,
            sessionType: input.mode,
            status: 'ACTIVE',
            planPolicyVersion: 'session-selection-v1',
            idempotencyKey,
            requestHash,
            items: {
              create: exercises.map((exercise, position) => ({
                exerciseId: exercise.id,
                position,
                selectionReason: exercise.bucket,
              })),
            },
          },
          select: { id: true, status: true, sessionType: true, startedAt: true },
        });
        return {
          id: session.id,
          status: session.status,
          mode: session.sessionType,
          startedAt: session.startedAt.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async getNext(userId: string, sessionId: string): Promise<ExerciseView | null> {
    return this.prisma.$transaction(
      async (tx) => {
        let item = await tx.sessionItem.findFirst({
          where: {
            sessionId,
            session: { userId, status: 'ACTIVE' },
            status: { in: ['PLANNED', 'PRESENTED'] },
          },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            status: true,
            _count: { select: { attempts: true } },
            exercise: {
              select: {
                id: true,
                type: true,
                promptContextVi: true,
                instructionVi: true,
                constraintsJson: true,
                sentences: {
                  orderBy: { position: 'asc' },
                  take: 1,
                  select: { sourceTextVi: true },
                },
                targets: {
                  select: {
                    grammarPointVersion: {
                      select: {
                        title: true,
                        cefrLevel: true,
                        shortDescription: true,
                        formSummary: true,
                        meaningSummary: true,
                        usageNotes: true,
                        grammarPoint: { select: { code: true } },
                        rules: {
                          orderBy: { priority: 'asc' },
                          select: { ruleCode: true, ruleType: true, description: true },
                        },
                        examples: {
                          orderBy: { sortOrder: 'asc' },
                          select: {
                            exampleType: true,
                            englishText: true,
                            vietnameseText: true,
                            explanation: true,
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
        while (item && item._count.attempts >= 3) {
          await tx.sessionItem.update({
            where: { id: item.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          item = await tx.sessionItem.findFirst({
            where: {
              sessionId,
              session: { userId, status: 'ACTIVE' },
              status: { in: ['PLANNED', 'PRESENTED'] },
            },
            orderBy: { position: 'asc' },
            select: {
              id: true,
              status: true,
              _count: { select: { attempts: true } },
              exercise: {
                select: {
                  id: true,
                  type: true,
                  promptContextVi: true,
                  instructionVi: true,
                  constraintsJson: true,
                  sentences: {
                    orderBy: { position: 'asc' },
                    take: 1,
                    select: { sourceTextVi: true },
                  },
                  targets: {
                    select: {
                      grammarPointVersion: {
                        select: {
                          title: true,
                          cefrLevel: true,
                          shortDescription: true,
                          formSummary: true,
                          meaningSummary: true,
                          usageNotes: true,
                          grammarPoint: { select: { code: true } },
                          rules: {
                            orderBy: { priority: 'asc' },
                            select: { ruleCode: true, ruleType: true, description: true },
                          },
                          examples: {
                            orderBy: { sortOrder: 'asc' },
                            select: {
                              exampleType: true,
                              englishText: true,
                              vietnameseText: true,
                              explanation: true,
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
        }
        if (!item) return null;
        if (item.status === 'PLANNED')
          await tx.sessionItem.update({
            where: { id: item.id },
            data: { status: 'PRESENTED', presentedAt: new Date() },
          });
        const sentence = item.exercise.sentences[0];
        if (!sentence) throw new Error('EXERCISE_SENTENCE_MISSING');
        return {
          sessionItemId: item.id,
          exerciseId: item.exercise.id,
          type: item.exercise.type,
          contextVi: item.exercise.promptContextVi,
          instructionVi: item.exercise.instructionVi,
          sourceTextVi: sentence.sourceTextVi,
          promptPayload: readPromptPayload(item.exercise.constraintsJson),
          targets: item.exercise.targets.map((target) => ({
            code: target.grammarPointVersion.grammarPoint.code,
            title: target.grammarPointVersion.title,
            cefr: target.grammarPointVersion.cefrLevel,
            learningObjectiveVi: target.grammarPointVersion.shortDescription,
            formPatterns: splitSummary(target.grammarPointVersion.formSummary),
            meaningUses: splitSummary(target.grammarPointVersion.meaningSummary),
            usageNotes: splitSummary(target.grammarPointVersion.usageNotes ?? ''),
            rules: target.grammarPointVersion.rules.map((rule) => ({
              code: rule.ruleCode,
              type: rule.ruleType,
              description: rule.description,
            })),
            examples: target.grammarPointVersion.examples.map((example) => ({
              type: example.exampleType,
              english: example.englishText,
              vietnamese: example.vietnameseText,
              explanationVi: example.explanation,
            })),
          })),
          attemptLimit: 3,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async getSession(userId: string, sessionId: string): Promise<SessionStateView | null> {
    const session = await this.prisma.learningSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        id: true,
        status: true,
        sessionType: true,
        startedAt: true,
        completedAt: true,
        summaryJson: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            status: true,
            _count: { select: { attempts: true } },
            exercise: {
              select: {
                id: true,
                type: true,
                promptContextVi: true,
                instructionVi: true,
                constraintsJson: true,
                sentences: {
                  orderBy: { position: 'asc' },
                  take: 1,
                  select: { sourceTextVi: true },
                },
                targets: {
                  select: {
                    grammarPointVersion: {
                      select: {
                        title: true,
                        cefrLevel: true,
                        shortDescription: true,
                        formSummary: true,
                        meaningSummary: true,
                        usageNotes: true,
                        grammarPoint: { select: { code: true } },
                        rules: {
                          orderBy: { priority: 'asc' },
                          select: { ruleCode: true, ruleType: true, description: true },
                        },
                        examples: {
                          orderBy: { sortOrder: 'asc' },
                          select: {
                            exampleType: true,
                            englishText: true,
                            vietnameseText: true,
                            explanation: true,
                          },
                        },
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
    if (!session) return null;
    for (const item of session.items) {
      if (['PLANNED', 'PRESENTED'].includes(item.status) && item._count.attempts >= 3) {
        await this.prisma.sessionItem.update({
          where: { id: item.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        item.status = 'COMPLETED';
      }
    }
    const completed = session.items.filter((item) => item.status === 'COMPLETED').length;
    const current = session.items.find((item) => ['PLANNED', 'PRESENTED'].includes(item.status));
    // A resume response presents the same safe payload as /next, so it must also advance PLANNED
    // to PRESENTED; otherwise the evaluation boundary correctly rejects the visible item.
    if (current?.status === 'PLANNED') {
      await this.prisma.sessionItem.update({
        where: { id: current.id },
        data: { status: 'PRESENTED', presentedAt: new Date() },
      });
    }
    const sentence = current?.exercise.sentences[0];
    const currentItem: ExerciseView | null =
      current && sentence
        ? {
            sessionItemId: current.id,
            exerciseId: current.exercise.id,
            type: current.exercise.type,
            contextVi: current.exercise.promptContextVi,
            instructionVi: current.exercise.instructionVi,
            sourceTextVi: sentence.sourceTextVi,
            promptPayload: readPromptPayload(current.exercise.constraintsJson),
            targets: current.exercise.targets.map((target) => ({
              code: target.grammarPointVersion.grammarPoint.code,
              title: target.grammarPointVersion.title,
              cefr: target.grammarPointVersion.cefrLevel,
              learningObjectiveVi: target.grammarPointVersion.shortDescription,
              formPatterns: splitSummary(target.grammarPointVersion.formSummary),
              meaningUses: splitSummary(target.grammarPointVersion.meaningSummary),
              usageNotes: splitSummary(target.grammarPointVersion.usageNotes ?? ''),
              rules: target.grammarPointVersion.rules.map((rule) => ({
                code: rule.ruleCode,
                type: rule.ruleType,
                description: rule.description,
              })),
              examples: target.grammarPointVersion.examples.map((example) => ({
                type: example.exampleType,
                english: example.englishText,
                vietnamese: example.vietnameseText,
                explanationVi: example.explanation,
              })),
            })),
            attemptLimit: 3,
          }
        : null;
    const storedSummary = session.completedAt
      ? (session.summaryJson as unknown as SessionSummaryView)
      : null;
    return {
      id: session.id,
      status: session.status,
      mode: session.sessionType,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      progress: {
        total: session.items.length,
        completed,
        remaining: session.items.length - completed,
      },
      currentItem,
      summary: storedSummary,
    };
  }

  async listRevealedHints(userId: string, itemId: string): Promise<VocabularyHintView[]> {
    const events = await this.prisma.hintEvent.findMany({
      where: { userId, sessionItemId: itemId, sessionItem: { session: { userId } } },
      orderBy: { hintLevel: 'asc' },
      select: {
        revealedAt: true,
        vocabularyHint: {
          select: {
            id: true,
            hintLevel: true,
            hintTextVi: true,
            vocabularyEntry: { select: { lemma: true, partOfSpeech: true } },
          },
        },
      },
    });
    const availableCount = await this.prisma.vocabularyHint.count({
      where: {
        isAnswerRevealing: false,
        vocabularyEntry: { status: 'PUBLISHED' },
        exercise: { sessionItems: { some: { id: itemId, session: { userId } } } },
      },
    });
    return events.map((event, index) => ({
      id: event.vocabularyHint.id,
      level: event.vocabularyHint.hintLevel,
      textVi: event.vocabularyHint.hintTextVi,
      lemma:
        event.vocabularyHint.hintLevel >= 2 ? event.vocabularyHint.vocabularyEntry.lemma : null,
      partOfSpeech:
        event.vocabularyHint.hintLevel >= 2
          ? event.vocabularyHint.vocabularyEntry.partOfSpeech
          : null,
      revealedAt: event.revealedAt.toISOString(),
      hasMore: index < availableCount - 1,
    }));
  }

  /** Reveals one curated non-answer-leaking hint and records the reveal idempotently. */
  async revealNextHint(userId: string, itemId: string): Promise<VocabularyHintView | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.sessionItem.findFirst({
          where: { id: itemId, session: { userId, status: 'ACTIVE' } },
          select: {
            exerciseId: true,
            hintEvents: {
              where: { userId },
              select: { vocabularyHintId: true },
            },
          },
        });
        if (!item) throw new Error('SESSION_ITEM_NOT_FOUND');
        const revealedIds = item.hintEvents.map((event) => event.vocabularyHintId);
        const hint = await tx.vocabularyHint.findFirst({
          where: {
            exerciseId: item.exerciseId,
            id: { notIn: revealedIds },
            isAnswerRevealing: false,
            vocabularyEntry: { status: 'PUBLISHED' },
          },
          orderBy: [{ hintLevel: 'asc' }, { position: 'asc' }],
          select: {
            id: true,
            hintLevel: true,
            hintTextVi: true,
            vocabularyEntry: { select: { lemma: true, partOfSpeech: true } },
          },
        });
        if (!hint) return null;
        const event = await tx.hintEvent.upsert({
          where: {
            userId_sessionItemId_vocabularyHintId_hintLevel: {
              userId,
              sessionItemId: itemId,
              vocabularyHintId: hint.id,
              hintLevel: hint.hintLevel,
            },
          },
          create: {
            userId,
            sessionItemId: itemId,
            vocabularyHintId: hint.id,
            hintLevel: hint.hintLevel,
          },
          update: {},
          select: { revealedAt: true },
        });
        const remaining = await tx.vocabularyHint.count({
          where: {
            exerciseId: item.exerciseId,
            id: { notIn: [...revealedIds, hint.id] },
            isAnswerRevealing: false,
            vocabularyEntry: { status: 'PUBLISHED' },
          },
        });
        return {
          id: hint.id,
          level: hint.hintLevel,
          textVi: hint.hintTextVi,
          lemma: hint.hintLevel >= 2 ? hint.vocabularyEntry.lemma : null,
          partOfSpeech: hint.hintLevel >= 2 ? hint.vocabularyEntry.partOfSpeech : null,
          revealedAt: event.revealedAt.toISOString(),
          hasMore: remaining > 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Finalizes only fully accepted plans and persists an immutable summary in one transaction. */
  async completeSession(
    userId: string,
    sessionId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<SessionSummaryView> {
    return this.prisma.$transaction(
      async (tx) => {
        const keyOwner = await tx.learningSession.findFirst({
          where: { userId, completionIdempotencyKey: idempotencyKey },
          select: { id: true, completionRequestHash: true, summaryJson: true, completedAt: true },
        });
        if (keyOwner) {
          if (keyOwner.id !== sessionId || keyOwner.completionRequestHash !== requestHash)
            throw new Error('IDEMPOTENCY_KEY_REUSED');
          if (!keyOwner.completedAt) throw new Error('SESSION_NOT_READY');
          return keyOwner.summaryJson as unknown as SessionSummaryView;
        }
        const session = await tx.learningSession.findFirst({
          where: { id: sessionId, userId },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            summaryJson: true,
            items: {
              select: {
                status: true,
                attempts: {
                  select: {
                    attemptNo: true,
                    evaluations: {
                      where: { isEffective: true },
                      take: 1,
                      select: { disposition: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!session) throw new Error('SESSION_NOT_FOUND');
        if (session.status === 'COMPLETED')
          return session.summaryJson as unknown as SessionSummaryView;
        if (session.items.some((item) => item.status !== 'COMPLETED'))
          throw new Error('SESSION_NOT_READY');
        const completedAt = new Date();
        const acceptedItems = session.items.filter((item) =>
          item.attempts.some((attempt) =>
            attempt.evaluations.some((evaluation) =>
              ['ACCEPT', 'ACCEPT_WITH_FEEDBACK'].includes(evaluation.disposition),
            ),
          ),
        ).length;
        const retryItems = session.items.filter((item) =>
          item.attempts.some((attempt) => attempt.attemptNo > 1),
        ).length;
        const summary: SessionSummaryView = {
          sessionId: session.id,
          completedAt: completedAt.toISOString(),
          totalItems: session.items.length,
          completedItems: session.items.length,
          acceptedItems,
          retryItems,
          durationSeconds: Math.max(
            0,
            Math.round((completedAt.getTime() - session.startedAt.getTime()) / 1000),
          ),
        };
        await tx.learningSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            completedAt,
            summaryJson: { ...summary },
            completionIdempotencyKey: idempotencyKey,
            completionRequestHash: requestHash,
          },
        });
        return summary;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function splitSummary(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readPromptPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const payload = value.promptPayload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}
