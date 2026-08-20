import type { PrismaClient } from '@prisma/client';
import { errorPatternPolicyVersion, projectErrorPatterns } from './error-pattern-policy.js';
import {
  classifyUnitChallengeEvidence,
  unitChallengePolicyVersion,
} from './unit-challenge-policy.js';
import type {
  EngagementRepository,
  ErrorEvidenceEvent,
  ErrorNotebookView,
  UnitChallengePlan,
  UnitChallengeView,
} from './types.js';

export class PrismaEngagementRepository implements EngagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async refreshAndListErrorPatterns(userId: string): Promise<ErrorNotebookView> {
    const evaluations = await this.prisma.evaluation.findMany({
      where: { isEffective: true, attempt: { userId } },
      orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
      select: {
        disposition: true,
        completedAt: true,
        attempt: {
          select: {
            id: true,
            sessionItem: { select: { sessionId: true } },
            exercise: {
              select: {
                targets: {
                  where: { targetRole: 'PRIMARY' },
                  take: 1,
                  select: { grammarPointVersion: { select: { grammarPointId: true } } },
                },
              },
            },
          },
        },
        evaluationFindings: {
          where: { severity: { not: 'INFO' } },
          select: { category: true, code: true, grammarPointId: true },
        },
      },
    });
    const events: ErrorEvidenceEvent[] = [];
    for (const evaluation of evaluations) {
      const primaryPointId =
        evaluation.attempt.exercise.targets[0]?.grammarPointVersion.grammarPointId;
      for (const finding of evaluation.evaluationFindings) {
        const grammarPointId = finding.grammarPointId ?? primaryPointId;
        if (!grammarPointId) continue;
        events.push({
          type: 'FAILURE',
          grammarPointId,
          category: finding.category,
          code: finding.code,
          occurredAt: evaluation.completedAt,
          sessionId: evaluation.attempt.sessionItem.sessionId,
          attemptId: evaluation.attempt.id,
        });
      }
      if (primaryPointId && ['ACCEPT', 'ACCEPT_WITH_FEEDBACK'].includes(evaluation.disposition))
        events.push({
          type: 'SUCCESS',
          grammarPointId: primaryPointId,
          occurredAt: evaluation.completedAt,
          sessionId: evaluation.attempt.sessionItem.sessionId,
          attemptId: evaluation.attempt.id,
        });
    }
    const projected = projectErrorPatterns(events);
    await this.prisma.$transaction(async (tx) => {
      const keptIds: string[] = [];
      for (const pattern of projected) {
        const saved = await tx.learnerErrorPattern.upsert({
          where: {
            userId_grammarPointId_category_code: {
              userId,
              grammarPointId: pattern.grammarPointId,
              category: pattern.category,
              code: pattern.code,
            },
          },
          create: { userId, policyVersion: errorPatternPolicyVersion, ...pattern },
          update: { policyVersion: errorPatternPolicyVersion, ...pattern },
          select: { id: true },
        });
        keptIds.push(saved.id);
      }
      await tx.learnerErrorPattern.deleteMany({
        where: { userId, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) },
      });
    });
    const rows = await this.prisma.learnerErrorPattern.findMany({
      where: { userId },
      orderBy: [{ state: 'asc' }, { lastSeenAt: 'desc' }],
      select: {
        id: true,
        grammarPointId: true,
        category: true,
        code: true,
        state: true,
        occurrenceCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        grammarPoint: {
          select: {
            code: true,
            versions: {
              where: { status: 'PUBLISHED', locale: 'vi' },
              orderBy: { versionNo: 'desc' },
              take: 1,
              select: { title: true },
            },
          },
        },
        representativeAttempt: {
          select: {
            answerText: true,
            evaluations: {
              where: { isEffective: true },
              take: 1,
              select: { feedbackVi: true, correctedAnswer: true },
            },
          },
        },
      },
    });
    return {
      policyVersion: errorPatternPolicyVersion,
      patterns: rows.map((row) => ({
        id: row.id,
        grammarPointId: row.grammarPointId,
        grammarCode: row.grammarPoint.code,
        grammarTitle: row.grammarPoint.versions[0]?.title ?? row.grammarPoint.code,
        category: row.category,
        code: row.code,
        state: row.state as 'ACTIVE' | 'IMPROVING' | 'RESOLVED' | 'RECURRED',
        occurrenceCount: row.occurrenceCount,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        representative: {
          answer: row.representativeAttempt.answerText,
          feedbackVi: row.representativeAttempt.evaluations[0]?.feedbackVi ?? '',
          correctedAnswer: row.representativeAttempt.evaluations[0]?.correctedAnswer ?? null,
        },
      })),
    };
  }

  async getOwnedPatternTarget(userId: string, patternId: string): Promise<string | null> {
    const pattern = await this.prisma.learnerErrorPattern.findFirst({
      where: { id: patternId, userId },
      select: { grammarPointId: true },
    });
    return pattern?.grammarPointId ?? null;
  }

  async getUnitTargetPlan(
    userId: string,
    unitId: string,
  ): Promise<Array<{ id: string; code: string; title: string }> | null> {
    const unit = await this.prisma.curriculumUnit.findFirst({
      where: { id: unitId, level: { release: { status: 'PUBLISHED' } } },
      select: {
        levelId: true,
        level: { select: { releaseId: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            grammarPointVersion: {
              select: { grammarPoint: { select: { id: true, code: true } }, title: true },
            },
          },
        },
      },
    });
    if (!unit) return null;
    const enrollment = await this.prisma.userCurriculumEnrollment.findUnique({
      where: { userId_releaseId: { userId, releaseId: unit.level.releaseId } },
      select: { status: true, currentLevelId: true },
    });
    if (enrollment?.status !== 'ACTIVE' || enrollment.currentLevelId !== unit.levelId) return null;
    return unit.items.map(({ grammarPointVersion }) => ({
      id: grammarPointVersion.grammarPoint.id,
      code: grammarPointVersion.grammarPoint.code,
      title: grammarPointVersion.title,
    }));
  }

  async createUnitChallenge(
    userId: string,
    unitId: string,
    sessionId: string,
    targets: Array<{ id: string; code: string; title: string }>,
  ): Promise<UnitChallengePlan> {
    const challenge = await this.prisma.unitChallenge.upsert({
      where: { sessionId },
      create: {
        userId,
        unitId,
        sessionId,
        policyVersion: unitChallengePolicyVersion,
        targets: {
          create: targets.map((target, sortOrder) => ({
            grammarPointId: target.id,
            grammarCode: target.code,
            grammarTitle: target.title,
            sortOrder,
          })),
        },
      },
      update: {},
      select: { id: true, sessionId: true },
    });
    return { challengeId: challenge.id, sessionId: challenge.sessionId };
  }

  async getUnitChallenge(userId: string, challengeId: string): Promise<UnitChallengeView | null> {
    const challenge = await this.prisma.unitChallenge.findFirst({
      where: { id: challengeId, userId },
      select: {
        id: true,
        unitId: true,
        sessionId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        unit: { select: { title: true } },
        session: {
          select: {
            status: true,
            completedAt: true,
            items: {
              select: {
                attempts: {
                  orderBy: { attemptNo: 'desc' },
                  select: {
                    id: true,
                    evaluations: {
                      where: { isEffective: true },
                      take: 1,
                      select: { disposition: true },
                    },
                  },
                },
                exercise: {
                  select: {
                    targets: {
                      where: { targetRole: 'PRIMARY' },
                      select: { grammarPointVersion: { select: { grammarPointId: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        targets: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!challenge) return null;
    if (challenge.session.status === 'COMPLETED' && challenge.status !== 'COMPLETED') {
      await this.prisma.unitChallenge.update({
        where: { id: challenge.id },
        data: { status: 'COMPLETED', completedAt: challenge.session.completedAt ?? new Date() },
      });
    }
    const targets = challenge.targets.map((target) => {
      const attempts = challenge.session.items
        .filter((item) =>
          item.exercise.targets.some(
            (exerciseTarget) =>
              exerciseTarget.grammarPointVersion.grammarPointId === target.grammarPointId,
          ),
        )
        .flatMap((item) => item.attempts);
      const evidence = attempts.find((attempt) => attempt.evaluations[0]);
      const disposition = evidence?.evaluations[0]?.disposition ?? null;
      const outcome = classifyUnitChallengeEvidence(disposition);
      return {
        grammarPointId: target.grammarPointId,
        grammarCode: target.grammarCode,
        grammarTitle: target.grammarTitle,
        outcome,
        disposition,
        attemptId: evidence?.id ?? null,
        reasonCodes:
          outcome === 'NO_EVIDENCE'
            ? ['NO_RELIABLE_EVIDENCE']
            : outcome === 'PASSED'
              ? ['TARGET_ACCEPTED']
              : ['TARGET_RETRY_REQUIRED'],
      };
    });
    return {
      id: challenge.id,
      unitId: challenge.unitId,
      unitTitle: challenge.unit.title,
      sessionId: challenge.sessionId,
      status: challenge.session.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      policyVersion: unitChallengePolicyVersion,
      startedAt: challenge.startedAt.toISOString(),
      completedAt:
        challenge.session.completedAt?.toISOString() ??
        challenge.completedAt?.toISOString() ??
        null,
      targets,
      remediationGrammarPointIds: targets
        .filter((target) => target.outcome === 'NEEDS_PRACTICE')
        .map((target) => target.grammarPointId),
    };
  }
}
