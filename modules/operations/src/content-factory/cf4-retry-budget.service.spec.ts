import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Cf4LevelBatch, Cf4BatchPoint } from './cf4-level-batch-planner.js';
import type { Cf4BatchReadinessReport, Cf4LevelBatchService } from './cf4-level-batch.service.js';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import type { Cf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import type { LessonGenerator } from './lesson-generator.js';
import type { IndependentContentReviewer } from './independent-reviewer.js';
import type { ExerciseFactory } from './exercise-factory.js';
import type { ContentValidationRunRepository } from './validation-run-repository.js';
import type { ContentReviewRunRepository } from './review-run-repository.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';
import { Cf4RetryBudgetService } from './cf4-retry-budget.service.js';

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

function batch(): Cf4LevelBatch {
  return {
    batchCode: 'A1-CF4-01',
    cefr: 'A1',
    batchIndex: 1,
    plannedMaximumBatchSize: 5,
    reviewProfile: 'STANDARD',
    exerciseTargetPerPoint: 20,
    requiresRegressionAfterBatch: true,
    requiresOwnerApprovalBeforePublish: true,
    points: [point('A1_P1', 1), point('A1_P2', 2), point('A1_P3', 3)],
  };
}

function readyReport(): Cf4BatchReadinessReport {
  const target = batch();
  return {
    schemaVersion: '1.0',
    phase: 'CF4',
    runId: '11111111-1111-4111-8111-111111111111',
    manifestRunId: '22222222-2222-4222-8222-222222222222',
    batchCode: target.batchCode,
    cefr: target.cefr,
    reviewProfile: target.reviewProfile,
    exerciseTargetPerPoint: target.exerciseTargetPerPoint,
    status: 'READY_FOR_APPROVAL',
    targetCount: 3,
    readyCount: 3,
    regression: {
      schemaVersion: '1.0',
      phase: 'CF4',
      batchCode: target.batchCode,
      cefr: target.cefr,
      passed: true,
      checkedPointCount: 3,
      findings: [],
    },
    points: target.points.map((item, index) => ({
      code: item.code,
      version: 1,
      status: 'READY_FOR_APPROVAL',
      reviewProfile: 'STANDARD',
      grammarJobId: `grammar-${index}`,
      grammarHash: `${index + 1}`.repeat(64),
      grammarValidationRunId: `gv-${index}`,
      reviewJobId: `review-${index}`,
      reviewRunId: `rr-${index}`,
      reviewReportHash: `${index + 4}`.repeat(64),
      exerciseJobId: `exercise-${index}`,
      exerciseHash: `${index + 7}`.repeat(64),
      exerciseValidationRunId: `ev-${index}`,
      exerciseCount: 20,
      errorCode: null,
    })),
    generatedAt: '2026-08-21T00:00:00.000Z',
  };
}

function service(params: {
  queryResult: Array<{ id: string }>;
  baseline: { runBatch: ReturnType<typeof vi.fn> };
}) {
  const prisma = {
    $queryRaw: vi.fn(async () => params.queryResult),
    contentFactoryRun: {
      findUnique: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
    },
    contentFactoryArtifact: {
      findFirst: vi.fn(async () => null),
    },
  } as unknown as PrismaClient;
  const gate = { assertApprovedBatch: vi.fn(async () => undefined) } as Cf4ManifestApprovalGate;
  const storage = {
    saveArtifact: vi.fn(),
    readArtifact: vi.fn(),
    removeArtifact: vi.fn(),
  } as unknown as ContentFactoryStorageRepository;
  const runner = new Cf4RetryBudgetService(
    prisma,
    params.baseline as unknown as Cf4LevelBatchService,
    {} as ContentFactoryOrchestratorService,
    gate,
    {} as LessonGenerator,
    {} as IndependentContentReviewer,
    {} as ExerciseFactory,
    {} as ContentValidationRunRepository,
    {} as ContentReviewRunRepository,
    storage,
  );
  return { runner, prisma, gate };
}

describe('Cf4RetryBudgetService', () => {
  it('reserves the attempt-1 budget envelope before invoking the baseline pipeline', async () => {
    const runBatch = vi.fn(async () => readyReport());
    const { runner, prisma, gate } = service({
      queryResult: [{ id: '11111111-1111-4111-8111-111111111111' }],
      baseline: { runBatch },
    });

    const result = await runner.runWithRetries({
      runId: '11111111-1111-4111-8111-111111111111',
      manifestRunId: '22222222-2222-4222-8222-222222222222',
      batch: batch(),
    });

    expect(gate.assertApprovedBatch).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(runBatch).toHaveBeenCalledOnce();
    expect(result.repairStatus).toBe('NOT_NEEDED');
    expect(result.initialBudgetReservation?.requests).toBe(9);
  });

  it('does not invoke the baseline pipeline when the run budget is exhausted', async () => {
    const runBatch = vi.fn(async () => readyReport());
    const { runner } = service({ queryResult: [], baseline: { runBatch } });

    await expect(
      runner.runWithRetries({
        runId: '11111111-1111-4111-8111-111111111111',
        manifestRunId: '22222222-2222-4222-8222-222222222222',
        batch: batch(),
      }),
    ).rejects.toThrow('CF4_RUN_BUDGET_EXHAUSTED');

    expect(runBatch).not.toHaveBeenCalled();
  });
});
