import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import type { Cf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import type { GrammarPointBundleSpec, LessonGenerator } from './lesson-generator.js';
import type { IndependentContentReviewer } from './independent-reviewer.js';
import type { ExerciseFactory } from './exercise-factory.js';
import type { ContentValidationRunRepository } from './validation-run-repository.js';
import type { ContentReviewRunRepository } from './review-run-repository.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';
import {
  Cf4LevelBatchService,
  type Cf4BatchPointResult,
} from './cf4-level-batch.service.js';
import type { Cf4BatchPoint, Cf4LevelBatch } from './cf4-level-batch-planner.js';

function point(code: string, sortOrder: number): Cf4BatchPoint {
  return {
    code,
    family: 'TEST',
    canonicalSlug: code.toLowerCase(),
    titleVi: code,
    titleEn: code,
    assessableDistinction: `Distinction for ${code}`,
    communicativeFunctions: ['test'],
    formBoundary: 'bounded form',
    meaningBoundary: 'bounded meaning',
    useBoundary: 'bounded use',
    prerequisites: [],
    buildsOn: [],
    contrastsWith: [],
    oftenConfusedWith: [],
    vocabularyDomains: ['GENERAL'],
    rationale: 'test fixture',
    sortOrder,
    cefr: 'A1',
    unitCode: 'A1_U01',
  };
}

function batch(
  points = [point('A1_P1', 1), point('A1_P2', 2), point('A1_P3', 3)],
): Cf4LevelBatch {
  return {
    batchCode: 'A1-CF4-01',
    cefr: 'A1',
    batchIndex: 1,
    plannedMaximumBatchSize: 5,
    reviewProfile: 'STANDARD',
    exerciseTargetPerPoint: 20,
    requiresRegressionAfterBatch: true,
    requiresOwnerApprovalBeforePublish: true,
    points,
  };
}

function service(params?: {
  prisma?: PrismaClient;
  manifestGate?: Cf4ManifestApprovalGate;
  grammarAuthor?: LessonGenerator;
}): Cf4LevelBatchService {
  const prisma =
    params?.prisma ??
    ({
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({ id: 'run-id' })),
      },
    } as unknown as PrismaClient);
  const manifestGate =
    params?.manifestGate ??
    ({ assertApprovedBatch: vi.fn(async () => undefined) } as Cf4ManifestApprovalGate);

  return new Cf4LevelBatchService(
    prisma,
    {} as ContentFactoryOrchestratorService,
    manifestGate,
    (params?.grammarAuthor ?? {}) as LessonGenerator,
    {} as IndependentContentReviewer,
    {} as ExerciseFactory,
    {} as ContentValidationRunRepository,
    {} as ContentReviewRunRepository,
    {} as ContentFactoryStorageRepository,
  );
}

describe('Cf4LevelBatchService safety gates', () => {
  it('rejects an undersized batch before any durable work starts', async () => {
    const prismaFind = vi.fn(async () => ({ id: 'run-id' }));
    const prisma = {
      contentFactoryRun: { findUnique: prismaFind },
    } as unknown as PrismaClient;
    const gate = { assertApprovedBatch: vi.fn(async () => undefined) } as Cf4ManifestApprovalGate;
    const runner = service({ prisma, manifestGate: gate });

    await expect(
      runner.runBatch({
        runId: 'run-id',
        manifestRunId: 'manifest-run-id',
        batch: batch([point('A1_P1', 1), point('A1_P2', 2)]),
      }),
    ).rejects.toThrow('CF4_BATCH_SCOPE_MUST_BE_3_TO_5_POINTS');

    expect(prismaFind).not.toHaveBeenCalled();
    expect(gate.assertApprovedBatch).not.toHaveBeenCalled();
  });

  it('does not invoke authoring when the manifest approval gate rejects the batch', async () => {
    const authorPointWithinBatch = vi.fn();
    const grammarAuthor = { authorPointWithinBatch } as unknown as LessonGenerator;
    const gate = {
      assertApprovedBatch: vi.fn(async () => {
        throw new Error('CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
      }),
    } as Cf4ManifestApprovalGate;
    const runner = service({ manifestGate: gate, grammarAuthor });

    await expect(
      runner.runBatch({
        runId: 'run-id',
        manifestRunId: 'manifest-run-id',
        batch: batch(),
      }),
    ).rejects.toThrow('CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');

    expect(gate.assertApprovedBatch).toHaveBeenCalledOnce();
    expect(authorPointWithinBatch).not.toHaveBeenCalled();
  });

  it('rejects an unsafe C1/C2 review profile before the approval gate', async () => {
    const unsafe = batch();
    unsafe.cefr = 'C1';
    unsafe.points = unsafe.points.map((item) => ({ ...item, cefr: 'C1' }));
    unsafe.exerciseTargetPerPoint = 30;
    unsafe.reviewProfile = 'STANDARD';
    const gate = { assertApprovedBatch: vi.fn(async () => undefined) } as Cf4ManifestApprovalGate;
    const runner = service({ manifestGate: gate });

    await expect(
      runner.runBatch({
        runId: 'run-id',
        manifestRunId: 'manifest-run-id',
        batch: unsafe,
      }),
    ).rejects.toThrow('CF4_BATCH_REVIEW_PROFILE_MISMATCH');

    expect(gate.assertApprovedBatch).not.toHaveBeenCalled();
  });

  it('resumes a reviewed grammar checkpoint without calling the author again', async () => {
    const authorPointWithinBatch = vi.fn();
    const grammarAuthor = { authorPointWithinBatch } as unknown as LessonGenerator;
    const runner = service({ grammarAuthor });
    const grammar = {
      code: 'A1_P1',
      version: 1,
      provenance: { provider: 'OPENAI', model: 'author-model' },
    } as unknown as GrammarPointBundleSpec;
    const checkpointLoader = vi.fn(async () => ({
      grammar,
      grammarJson: JSON.stringify(grammar),
      grammarJobId: 'grammar-job',
      grammarHash: 'a'.repeat(64),
      grammarValidationRunId: 'grammar-validation',
      reviewJobId: 'review-job',
      reviewRunId: 'review-run',
      reviewReportHash: 'b'.repeat(64),
      reviewProfile: 'STANDARD' as const,
    }));
    const exerciseStage = vi.fn(
      async (params: { result: Cf4BatchPointResult }): Promise<Cf4BatchPointResult> => ({
        ...params.result,
        status: 'READY_FOR_APPROVAL',
        exerciseJobId: 'exercise-job',
        exerciseHash: 'c'.repeat(64),
        exerciseValidationRunId: 'exercise-validation',
        exerciseCount: 20,
      }),
    );
    const internals = runner as unknown as {
      tryLoadReviewedGrammarCheckpoint: typeof checkpointLoader;
      runExerciseStage: typeof exerciseStage;
      runPoint(params: {
        runId: string;
        batch: Cf4LevelBatch;
        target: Cf4BatchPoint;
        targetVersion: number;
        workerPrefix: string;
      }): Promise<Cf4BatchPointResult>;
    };
    internals.tryLoadReviewedGrammarCheckpoint = checkpointLoader;
    internals.runExerciseStage = exerciseStage;

    const result = await internals.runPoint({
      runId: 'run-id',
      batch: batch(),
      target: point('A1_P1', 1),
      targetVersion: 1,
      workerPrefix: 'cf4:test',
    });

    expect(checkpointLoader).toHaveBeenCalledOnce();
    expect(authorPointWithinBatch).not.toHaveBeenCalled();
    expect(exerciseStage).toHaveBeenCalledOnce();
    expect(result.status).toBe('READY_FOR_APPROVAL');
    expect(result.grammarJobId).toBe('grammar-job');
  });

  it('does not trust a stored PASS review that is below the CF4 quality gate', () => {
    const runner = service();
    const internals = runner as unknown as {
      isStoredReviewReady(params: {
        reportJson: unknown;
        runId: string;
        targetCode: string;
        targetVersion: number;
        grammarHash: string;
        grammarProvider: string | null;
        grammarModel: string | null;
        reviewProfile: 'STANDARD' | 'ADVANCED';
        expectedPromptVersion: string;
      }): boolean;
    };
    const runId = '11111111-1111-4111-8111-111111111111';
    const grammarHash = 'a'.repeat(64);
    const storedPass = {
      schemaVersion: '1.0',
      artifactCode: 'A1_P1',
      artifactVersion: 1,
      artifactHash: grammarHash,
      reviewer: {
        provider: 'SECONDARY_OPENAI_COMPATIBLE',
        model: 'reviewer-model',
        promptVersion: 'cf4-independent-review-v1',
        runId,
      },
      decision: 'PASS',
      confidence: 0.95,
      scores: {
        correctness: 20,
        specificity: 14,
        examples: 14,
        vietnamesePedagogy: 10,
        cefrFit: 10,
        evaluatorReadiness: 6,
        originalityDiversity: 4,
        provenanceCompleteness: 4,
        total: 70,
      },
      findings: [],
      reviewedAt: '2026-08-21T00:00:00.000Z',
    };

    expect(
      internals.isStoredReviewReady({
        reportJson: storedPass,
        runId,
        targetCode: 'A1_P1',
        targetVersion: 1,
        grammarHash,
        grammarProvider: 'OPENAI',
        grammarModel: 'author-model',
        reviewProfile: 'STANDARD',
        expectedPromptVersion: 'cf4-independent-review-v1',
      }),
    ).toBe(false);
  });
});
