import {
  Prisma,
  type ContentFactoryJobPurpose,
  type PrismaClient,
} from '@prisma/client';
import { computeIdempotencyKey, computeSha256 } from './idempotency-lease-manager.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

export interface Cf4PinnedPolicyVersions {
  factory: 'content-factory-v1';
  schema: string;
  prompt: string;
}

export interface Cf4JobAttemptInput {
  runId: string;
  purpose: ContentFactoryJobPurpose;
  targetCode: string;
  targetVersion: number;
  inputContent: string;
  policyVersions: Cf4PinnedPolicyVersions;
  attempt: 1 | 2 | 3;
  budget?: {
    maxRequests: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxEstimatedCost: number;
  };
}

export interface Cf4BudgetReservation {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface Cf4BudgetReservationReceipt {
  reservation: Cf4BudgetReservation;
  reused: boolean;
  markerHash: string;
}

export interface Cf4AiBudgetEstimate {
  outputTokens: number;
  estimatedCost?: number;
}

export interface Cf4RunScopeReceipt {
  scopeHash: string;
  reused: boolean;
}

/**
 * CF4 durable execution controls for bounded retries and run budget enforcement.
 * Attempts 1..3 create separate immutable job identities. Budget reservation is
 * atomic, so concurrent workers cannot overspend one ContentFactoryRun.
 */
export class Cf4ExecutionControl {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public estimateInputTokens(content: string): number {
    const bytes = Buffer.byteLength(content, 'utf8');
    return Math.max(1, Math.ceil(bytes / 4));
  }

  public async reserveAiCallBudget(params: {
    runId: string;
    input: string;
    estimate: Cf4AiBudgetEstimate;
  }): Promise<Cf4BudgetReservation> {
    return this.reserveRunBudget(params.runId, {
      requests: 1,
      inputTokens: this.estimateInputTokens(params.input),
      outputTokens: params.estimate.outputTokens,
      estimatedCost: params.estimate.estimatedCost ?? 0,
    });
  }

  public async reserveRunBudget(
    runId: string,
    reservation: Cf4BudgetReservation,
  ): Promise<Cf4BudgetReservation> {
    this.assertReservation(reservation);

    // The only multi-request reservation in CF4 is the attempt-1 batch envelope.
    // Make that envelope durable/idempotent so a crash before readiness evidence
    // cannot charge it a second time on resume. Per-provider retry calls remain
    // requests=1 and are charged independently on every real call.
    if (reservation.requests > 1) {
      const receipt = await this.reserveRunBudgetOnce({
        runId,
        reservationKey: 'cf4-initial-attempt-envelope-v1',
        reservation,
      });
      return receipt.reservation;
    }

    const updated = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "content_factory_runs"
      SET "used_requests" = "used_requests" + ${reservation.requests},
          "used_input_tokens" = "used_input_tokens" + ${reservation.inputTokens},
          "used_output_tokens" = "used_output_tokens" + ${reservation.outputTokens},
          "used_cost" = "used_cost" + ${reservation.estimatedCost},
          "updated_at" = ${new Date()}
      WHERE "id" = ${runId}::uuid
        AND "used_requests" + ${reservation.requests} <= "max_requests"
        AND "used_input_tokens" + ${reservation.inputTokens} <= "max_input_tokens"
        AND "used_output_tokens" + ${reservation.outputTokens} <= "max_output_tokens"
        AND "used_cost" + ${reservation.estimatedCost} <= "max_estimated_cost"
      RETURNING "id"
    `);

    if (updated[0]) return reservation;

    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error('CF4_RUN_NOT_FOUND');
    throw new Error('CF4_RUN_BUDGET_EXHAUSTED');
  }

  /**
   * Reserves a named envelope exactly once. The advisory lock, counter update,
   * and DB-only immutable marker live in one PostgreSQL transaction, so a crash
   * cannot leave a charged budget without durable evidence that prevents the
   * same reservation from being charged again on resume.
   */
  public async reserveRunBudgetOnce(params: {
    runId: string;
    reservationKey: string;
    reservation: Cf4BudgetReservation;
  }): Promise<Cf4BudgetReservationReceipt> {
    this.assertReservation(params.reservation);
    const reservationKey = params.reservationKey.trim();
    if (!reservationKey) throw new Error('CF4_BUDGET_RESERVATION_KEY_REQUIRED');

    const markerPayload = JSON.stringify({
      schemaVersion: '1.0',
      reservationKey,
      reservation: params.reservation,
    });
    const markerHash = computeSha256(markerPayload);
    const markerPath = `budget-reservations/${computeSha256(reservationKey).slice(0, 32)}.json`;
    const lockKey = `cf4-budget:${params.runId}:${reservationKey}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<unknown[]>(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
      `);

      const existing = await tx.contentFactoryArtifact.findFirst({
        where: {
          runId: params.runId,
          artifactType: 'CF4_BUDGET_RESERVATION',
          artifactPath: markerPath,
        },
      });
      if (existing) {
        if (existing.contentHash !== markerHash) {
          throw new Error('CF4_BUDGET_RESERVATION_KEY_MISMATCH');
        }
        return { reservation: params.reservation, reused: true, markerHash };
      }

      const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "content_factory_runs"
        SET "used_requests" = "used_requests" + ${params.reservation.requests},
            "used_input_tokens" = "used_input_tokens" + ${params.reservation.inputTokens},
            "used_output_tokens" = "used_output_tokens" + ${params.reservation.outputTokens},
            "used_cost" = "used_cost" + ${params.reservation.estimatedCost},
            "updated_at" = ${new Date()}
        WHERE "id" = ${params.runId}::uuid
          AND "used_requests" + ${params.reservation.requests} <= "max_requests"
          AND "used_input_tokens" + ${params.reservation.inputTokens} <= "max_input_tokens"
          AND "used_output_tokens" + ${params.reservation.outputTokens} <= "max_output_tokens"
          AND "used_cost" + ${params.reservation.estimatedCost} <= "max_estimated_cost"
        RETURNING "id"
      `);

      if (!updated[0]) {
        const run = await tx.contentFactoryRun.findUnique({ where: { id: params.runId } });
        if (!run) throw new Error('CF4_RUN_NOT_FOUND');
        throw new Error('CF4_RUN_BUDGET_EXHAUSTED');
      }

      await tx.contentFactoryArtifact.create({
        data: {
          runId: params.runId,
          artifactPath: markerPath,
          artifactType: 'CF4_BUDGET_RESERVATION',
          contentHash: markerHash,
          storageUri: `db://content-factory/${params.runId}/${markerPath}`,
          metadataJson: {
            schemaVersion: '1.0',
            reservationKey,
            reservation: params.reservation,
          },
        },
      });

      return { reservation: params.reservation, reused: false, markerHash };
    });
  }

  /**
   * Binds one ContentFactoryRun to exactly one CF4 manifest/batch/version scope.
   * Re-delivery of the same scope is idempotent; a different scope on the same
   * run fails closed before any provider call or job creation.
   */
  public async assertOrBindRunScope(params: {
    runId: string;
    scope: {
      phase: 'CF4';
      manifestRunId: string;
      batchCode: string;
      plannedMaximumBatchSize: number;
      targetVersion: number;
    };
  }): Promise<Cf4RunScopeReceipt> {
    const payload = JSON.stringify({ schemaVersion: '1.0', ...params.scope });
    const scopeHash = computeSha256(payload);
    const markerPath = 'run-scopes/cf4-batch-scope-v1.json';
    const lockKey = `cf4-scope:${params.runId}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<unknown[]>(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
      `);
      const existing = await tx.contentFactoryArtifact.findFirst({
        where: {
          runId: params.runId,
          artifactType: 'CF4_RUN_SCOPE',
          artifactPath: markerPath,
        },
      });
      if (existing) {
        if (existing.contentHash !== scopeHash) throw new Error('CF4_RUN_SCOPE_MISMATCH');
        return { scopeHash, reused: true };
      }

      const run = await tx.contentFactoryRun.findUnique({ where: { id: params.runId } });
      if (!run) throw new Error('CF4_RUN_NOT_FOUND');
      await tx.contentFactoryArtifact.create({
        data: {
          runId: params.runId,
          artifactPath: markerPath,
          artifactType: 'CF4_RUN_SCOPE',
          contentHash: scopeHash,
          storageUri: `db://content-factory/${params.runId}/${markerPath}`,
          metadataJson: { schemaVersion: '1.0', ...params.scope },
        },
      });
      return { scopeHash, reused: false };
    });
  }

  public async enqueueAttempt(params: Cf4JobAttemptInput) {
    this.assertAttempt(params.attempt);
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF4_RUN_NOT_FOUND');

    const inputHash = computeSha256(params.inputContent);
    const idempotencyKey = computeIdempotencyKey({
      runId: params.runId,
      purpose: params.purpose,
      inputHash,
      targetCode: params.targetCode,
      targetVersion: params.targetVersion,
      policyVersion: params.policyVersions.factory,
      schemaVersion: params.policyVersions.schema,
      promptVersion: params.policyVersions.prompt,
      attempt: params.attempt,
    });

    const existing = await this.prisma.contentFactoryJob.findUnique({
      where: { idempotencyKey },
      include: { artifacts: true },
    });
    if (existing) return { job: existing, isDuplicate: true };

    const filename = [
      'job',
      params.purpose.toLowerCase(),
      params.targetCode,
      `v${params.targetVersion}`,
      `att${params.attempt}`,
      inputHash.slice(0, 12),
      'input.json',
    ].join('_');
    const inputRef = this.storage.saveArtifact(params.runId, filename, params.inputContent);
    const budget = params.budget ?? {
      maxRequests: 1,
      maxInputTokens: 30000,
      maxOutputTokens: 20000,
      maxEstimatedCost: 1,
    };

    try {
      const job = await this.prisma.contentFactoryJob.create({
        data: {
          runId: params.runId,
          purpose: params.purpose,
          targetCode: params.targetCode,
          targetVersion: params.targetVersion,
          state: 'QUEUED',
          attempt: params.attempt,
          idempotencyKey,
          inputHash,
          policyVersionsJson: params.policyVersions,
          budgetJson: budget,
          artifacts: {
            create: {
              runId: params.runId,
              artifactPath: inputRef.artifactPath,
              artifactType: 'INPUT_SNAPSHOT',
              contentHash: inputRef.contentHash,
              storageUri: inputRef.storageUri,
            },
          },
        },
        include: { artifacts: true },
      });
      return { job, isDuplicate: false };
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === 'P2002') {
        const concurrent = await this.prisma.contentFactoryJob.findUnique({
          where: { idempotencyKey },
          include: { artifacts: true },
        });
        if (concurrent) return { job: concurrent, isDuplicate: true };
      }
      if (inputRef.created) this.storage.removeArtifact(params.runId, filename);
      throw error;
    }
  }

  private assertAttempt(attempt: number): asserts attempt is 1 | 2 | 3 {
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
      throw new Error('CF4_ATTEMPT_MUST_BE_1_TO_3');
    }
  }

  private assertReservation(reservation: Cf4BudgetReservation): void {
    const integerFields = [
      reservation.requests,
      reservation.inputTokens,
      reservation.outputTokens,
    ];
    if (integerFields.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error('CF4_BUDGET_RESERVATION_INVALID');
    }
    if (!Number.isFinite(reservation.estimatedCost) || reservation.estimatedCost < 0) {
      throw new Error('CF4_BUDGET_RESERVATION_INVALID');
    }
    if (reservation.requests === 0) throw new Error('CF4_BUDGET_REQUESTS_MUST_BE_POSITIVE');
  }
}
