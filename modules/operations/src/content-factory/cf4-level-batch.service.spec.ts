import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import type { Cf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import type { LessonGenerator } from './lesson-generator.js';
import type { IndependentContentReviewer } from './independent-reviewer.js';
import type { ExerciseFactory } from './exercise-factory.js';
import type { ContentValidationRunRepository } from './validation-run-repository.js';
import type { ContentReviewRunRepository } from './review-run-repository.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';
import { Cf4LevelBatchService } from './cf4-level-batch.service.js';
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
});
