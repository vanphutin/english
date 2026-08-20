import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { EvaluationRepository } from './evaluation.service.js';
import type { AttemptView, EvaluationView, SubmitAttemptInput } from './types.js';

const dimensionsForView = (
  value: Prisma.JsonValue,
): Record<string, 'PASS' | 'MINOR_ISSUES' | 'FAIL' | 'UNCERTAIN'> => {
  const dimensions = value as Record<
    string,
    { status: 'PASS' | 'MINOR_ISSUES' | 'FAIL' | 'UNCERTAIN' }
  >;
  return {
    targetGrammar: dimensions.targetGrammar?.status ?? 'UNCERTAIN',
    meaning: dimensions.meaningPreservation?.status ?? 'UNCERTAIN',
    otherGrammar: dimensions.otherGrammar?.status ?? 'UNCERTAIN',
  };
};

export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async submit(
    userId: string,
    itemId: string,
    idempotencyKey: string,
    requestHash: string,
    input: SubmitAttemptInput,
  ): Promise<AttemptView> {
    const attemptId = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.attempt.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          select: { id: true, requestHash: true },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
          return existing.id;
        }
        const item = await tx.sessionItem.findFirst({
          where: { id: itemId, session: { userId, status: 'ACTIVE' }, status: 'PRESENTED' },
          select: {
            exerciseId: true,
            _count: { select: { attempts: true } },
          },
        });
        if (!item) throw new Error('SESSION_ITEM_NOT_FOUND');
        if (item._count.attempts >= 3) {
          await tx.sessionItem.update({
            where: { id: itemId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          throw new Error('ATTEMPT_LIMIT_REACHED');
        }
        const attempt = await tx.attempt.create({
          data: {
            exerciseId: item.exerciseId,
            sessionItemId: itemId,
            userId,
            attemptNo: item._count.attempts + 1,
            answerText: input.answer,
            normalizedAnswer: input.answer.toLocaleLowerCase('en'),
            status: 'SUBMITTED',
            idempotencyKey,
            requestHash,
          },
          select: { id: true },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'ATTEMPT',
            aggregateId: attempt.id,
            eventType: 'ATTEMPT_EVALUATION_REQUESTED',
            payloadJson: { attemptId: attempt.id },
          },
        });
        return attempt.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return (await this.get(userId, attemptId))!;
  }

  async get(userId: string, attemptId: string): Promise<AttemptView | null> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        status: true,
        attemptNo: true,
        evaluations: {
          where: { isEffective: true },
          take: 1,
          select: {
            disposition: true,
            dimensionsJson: true,
            feedbackVi: true,
            correctedAnswer: true,
            evaluationFindings: {
              select: { category: true, severity: true, messageVi: true, suggestedFix: true },
            },
          },
        },
      },
    });
    if (!attempt) return null;
    const evaluation = attempt.evaluations[0];
    const view: AttemptView = { attemptId: attempt.id, status: attempt.status };
    if (evaluation) {
      const evaluationView: EvaluationView = {
        disposition: evaluation.disposition,
        dimensions: dimensionsForView(evaluation.dimensionsJson),
        feedbackVi: evaluation.feedbackVi,
        findings: evaluation.evaluationFindings.map((finding) => ({
          category: finding.category,
          severity: finding.severity,
          messageVi: finding.messageVi,
          ...(finding.suggestedFix ? { suggestedFix: finding.suggestedFix } : {}),
        })),
        ...(evaluation.correctedAnswer ? { correctedAnswer: evaluation.correctedAnswer } : {}),
        canRetry: evaluation.disposition === 'RETRY' && attempt.attemptNo < 3,
      };
      view.evaluation = evaluationView;
    }
    return view;
  }
}
