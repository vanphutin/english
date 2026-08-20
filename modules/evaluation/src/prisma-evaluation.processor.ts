import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { adjudicate } from './policy.js';
import { isRetryableProviderError, retryDelaySeconds } from './retry-policy.js';
import type { EvaluationContext, EvaluationProvider, ProviderResult } from './types.js';

interface ClaimedEvent {
  id: string;
  aggregateId: string;
  attempts: number;
}

export interface ProcessResult {
  state: 'IDLE' | 'SUCCEEDED' | 'RETRY_SCHEDULED' | 'DEAD_LETTERED';
  eventId?: string;
  attemptId?: string;
  errorCode?: string;
}

export class PrismaEvaluationProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: EvaluationProvider,
    private readonly evidenceRecorder: {
      recordEvaluationEvidence(userId: string, attemptId: string): Promise<void>;
    },
    private readonly options: { maxAttempts: number; leaseSeconds: number },
  ) {}

  /** Claims at most one due job. SKIP LOCKED allows safe concurrent local workers. */
  private async claim(workerId: string): Promise<ClaimedEvent | null> {
    const rows = await this.prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET "locked_at" = NOW(), "locked_by" = ${workerId}, "attempts" = "attempts" + 1
      WHERE "id" = (
        SELECT "id"
        FROM "outbox_events"
        WHERE "event_type" = 'ATTEMPT_EVALUATION_REQUESTED'
          AND "published_at" IS NULL
          AND "dead_lettered_at" IS NULL
          AND "available_at" <= NOW()
          AND ("locked_at" IS NULL OR "locked_at" < NOW() - (${this.options.leaseSeconds} * INTERVAL '1 second'))
        ORDER BY "available_at", "occurred_at"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id", "aggregate_id" AS "aggregateId", "attempts"
    `);
    return rows[0] ?? null;
  }

  async processNext(workerId: string): Promise<ProcessResult> {
    const event = await this.claim(workerId);
    if (!event) return { state: 'IDLE' };

    const prepared = await this.loadAttempt(event.aggregateId);
    if (!prepared) {
      await this.deadLetter(event.id, workerId, 'ATTEMPT_NOT_FOUND');
      return {
        state: 'DEAD_LETTERED',
        eventId: event.id,
        attemptId: event.aggregateId,
        errorCode: 'ATTEMPT_NOT_FOUND',
      };
    }
    if (prepared.hasEffectiveEvaluation) {
      await this.evidenceRecorder.recordEvaluationEvidence(prepared.userId, prepared.attemptId);
      await this.publish(event.id, workerId);
      return { state: 'SUCCEEDED', eventId: event.id, attemptId: prepared.attemptId };
    }

    await this.prisma.attempt.updateMany({
      where: { id: prepared.attemptId, status: { in: ['SUBMITTED', 'EVALUATING'] } },
      data: { status: 'EVALUATING' },
    });
    const providerResult = await this.provider.evaluate(prepared.context);
    const errorCode = providerResult.trace.errorCode ?? 'PROVIDER_ERROR';
    if (
      providerResult.trace.status === 'FAILED' &&
      event.attempts < this.options.maxAttempts &&
      isRetryableProviderError(errorCode)
    ) {
      await this.reschedule(event.id, workerId, event.attempts, errorCode, prepared.attemptId);
      return {
        state: 'RETRY_SCHEDULED',
        eventId: event.id,
        attemptId: prepared.attemptId,
        errorCode,
      };
    }

    await this.persistEvaluation(prepared, providerResult);
    await this.evidenceRecorder.recordEvaluationEvidence(prepared.userId, prepared.attemptId);
    if (providerResult.trace.status === 'FAILED') {
      await this.deadLetter(event.id, workerId, errorCode);
      return {
        state: 'DEAD_LETTERED',
        eventId: event.id,
        attemptId: prepared.attemptId,
        errorCode,
      };
    }
    await this.publish(event.id, workerId);
    return { state: 'SUCCEEDED', eventId: event.id, attemptId: prepared.attemptId };
  }

  private async loadAttempt(attemptId: string): Promise<{
    attemptId: string;
    attemptNo: number;
    userId: string;
    sessionItemId: string;
    requestHash: string;
    rubricVersion: string;
    hasEffectiveEvaluation: boolean;
    context: EvaluationContext;
  } | null> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        attemptNo: true,
        userId: true,
        sessionItemId: true,
        answerText: true,
        requestHash: true,
        evaluations: { where: { isEffective: true }, take: 1, select: { id: true } },
        exercise: {
          select: {
            type: true,
            constraintsJson: true,
            promptContextVi: true,
            evaluatorRubricVersion: true,
            sentences: {
              orderBy: { position: 'asc' },
              take: 1,
              select: {
                sourceTextVi: true,
                referenceAnswersJson: true,
                semanticRequirementsJson: true,
              },
            },
            targets: {
              select: {
                grammarPointVersion: {
                  select: { title: true, grammarPoint: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    const sentence = attempt?.exercise.sentences[0];
    if (!attempt || !sentence) return null;
    return {
      attemptId: attempt.id,
      attemptNo: attempt.attemptNo,
      userId: attempt.userId,
      sessionItemId: attempt.sessionItemId,
      requestHash: attempt.requestHash,
      rubricVersion: attempt.exercise.evaluatorRubricVersion,
      hasEffectiveEvaluation: attempt.evaluations.length > 0,
      context: {
        answer: attempt.answerText,
        activityType: attempt.exercise.type,
        promptPayload: readPromptPayload(attempt.exercise.constraintsJson),
        contextVi: attempt.exercise.promptContextVi,
        sourceTextVi: sentence.sourceTextVi,
        referenceAnswers: sentence.referenceAnswersJson as string[],
        semanticRequirements: sentence.semanticRequirementsJson as string[],
        targetGrammar: attempt.exercise.targets.map((target) => ({
          code: target.grammarPointVersion.grammarPoint.code,
          title: target.grammarPointVersion.title,
        })),
      },
    };
  }

  private async persistEvaluation(
    prepared: Awaited<ReturnType<PrismaEvaluationProcessor['loadAttempt']>> & {},
    result: ProviderResult,
  ): Promise<void> {
    const disposition = adjudicate(result.output);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.evaluation.findFirst({
        where: { attemptId: prepared.attemptId, isEffective: true },
        select: { id: true },
      });
      if (existing) return;
      const evaluation = await tx.evaluation.create({
        data: {
          attemptId: prepared.attemptId,
          evaluatorVersion: 'layered-evaluator-v1',
          rubricVersion: prepared.rubricVersion,
          disposition,
          targetUsed: result.output.dimensions.targetGrammar.status === 'PASS',
          meaningPreserved: result.output.dimensions.meaningPreservation.status === 'PASS',
          overallScore:
            disposition === 'ACCEPT' ? 100 : disposition === 'ACCEPT_WITH_FEEDBACK' ? 85 : 0,
          confidence: Math.min(
            result.output.dimensions.targetGrammar.confidence,
            result.output.dimensions.meaningPreservation.confidence,
          ),
          feedbackVi: result.output.feedbackVi,
          ...(result.output.correctedAnswer
            ? { correctedAnswer: result.output.correctedAnswer }
            : {}),
          dimensionsJson: result.output.dimensions,
          acceptedAlternative: result.output.acceptedAlternative,
          uncertaintyReasons: result.output.uncertaintyReasons,
          isEffective: true,
          evaluationFindings: {
            create: result.output.findings.map((finding) => ({
              category: finding.category,
              code: finding.code,
              severity: finding.severity,
              messageVi: finding.messageVi,
              ...(finding.evidenceText ? { evidenceSpanJson: { text: finding.evidenceText } } : {}),
              ...(finding.suggestedFix ? { suggestedFix: finding.suggestedFix } : {}),
            })),
          },
        },
        select: { id: true },
      });
      if (result.trace.provider === 'openai')
        await tx.aiCall.create({
          data: {
            evaluationId: evaluation.id,
            attemptId: prepared.attemptId,
            purpose: 'GRAMMAR_EVALUATION',
            provider: result.trace.provider,
            model: result.trace.model,
            promptTemplateVersion: 'grammar-evaluator-v1',
            requestHash: prepared.requestHash,
            responseSchemaVersion: '1.0',
            status: result.trace.status,
            ...(result.trace.latencyMs === undefined ? {} : { latencyMs: result.trace.latencyMs }),
            ...(result.trace.inputTokens === undefined
              ? {}
              : { inputTokens: result.trace.inputTokens }),
            ...(result.trace.outputTokens === undefined
              ? {}
              : { outputTokens: result.trace.outputTokens }),
            ...(result.trace.providerRequestId
              ? { providerRequestId: result.trace.providerRequestId }
              : {}),
            ...(result.trace.errorCode ? { errorCode: result.trace.errorCode } : {}),
            safeMetadataJson: { workerManaged: true },
          },
        });
      await tx.attempt.update({
        where: { id: prepared.attemptId },
        data: {
          status: disposition === 'SYSTEM_REVIEW' ? 'NEEDS_REVIEW' : 'EVALUATED',
          evaluatedAt: new Date(),
        },
      });
      // A learner must never be left on a PRESENTED item after consuming the final
      // attempt. Accepted answers and an exhausted third attempt both advance the plan.
      if (
        disposition === 'ACCEPT' ||
        disposition === 'ACCEPT_WITH_FEEDBACK' ||
        (disposition === 'RETRY' && prepared.attemptNo >= 3)
      )
        await tx.sessionItem.update({
          where: { id: prepared.sessionItemId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
    });
  }

  private async reschedule(
    eventId: string,
    workerId: string,
    attempts: number,
    errorCode: string,
    attemptId: string,
  ): Promise<void> {
    const delaySeconds = retryDelaySeconds(attempts);
    await this.prisma.$transaction([
      this.prisma.outboxEvent.updateMany({
        where: { id: eventId, lockedBy: workerId, publishedAt: null },
        data: {
          availableAt: new Date(Date.now() + delaySeconds * 1000),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
        },
      }),
      this.prisma.attempt.update({ where: { id: attemptId }, data: { status: 'SUBMITTED' } }),
    ]);
  }

  private async publish(eventId: string, workerId: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, lockedBy: workerId, publishedAt: null },
      data: { publishedAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null },
    });
  }

  private async deadLetter(eventId: string, workerId: string, errorCode: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, lockedBy: workerId, publishedAt: null },
      data: {
        deadLetteredAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: errorCode,
      },
    });
  }
}

function readPromptPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const payload = value.promptPayload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}
