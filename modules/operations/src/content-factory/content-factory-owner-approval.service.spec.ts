import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { computeSha256 } from './idempotency-lease-manager.js';
import type { Cf4BatchReadinessReport } from './cf4-level-batch.service.js';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import { ContentFactoryOwnerApprovalService } from './content-factory-owner-approval.service.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

const runId = '11111111-1111-4111-8111-111111111111';
const grammarHash = 'a'.repeat(64);
const reviewHash = 'b'.repeat(64);
const exerciseHash = 'c'.repeat(64);

function reviewReport(total = 96) {
  return {
    schemaVersion: '1.0',
    artifactCode: 'A1_P1',
    artifactVersion: 1,
    artifactHash: grammarHash,
    reviewer: {
      provider: 'OPENAI',
      model: 'review-model',
      promptVersion: 'cf4-independent-review-v1',
      runId,
    },
    decision: 'PASS',
    confidence: 0.95,
    scores: {
      correctness: total >= 88 ? 30 : 20,
      specificity: 14,
      examples: 14,
      vietnamesePedagogy: 10,
      cefrFit: 10,
      evaluatorReadiness: total >= 88 ? 10 : 6,
      originalityDiversity: 4,
      provenanceCompleteness: 4,
      total,
    },
    findings: [],
    reviewedAt: '2026-08-21T00:00:00.000Z',
  };
}

function readinessReport(): Cf4BatchReadinessReport {
  return {
    schemaVersion: '1.0',
    phase: 'CF4',
    runId,
    manifestRunId: '22222222-2222-4222-8222-222222222222',
    batchCode: 'CF4-A1-B001',
    cefr: 'A1',
    reviewProfile: 'STANDARD',
    exerciseTargetPerPoint: 20,
    status: 'READY_FOR_APPROVAL',
    targetCount: 1,
    readyCount: 1,
    regression: {
      schemaVersion: '1.0',
      phase: 'CF4',
      batchCode: 'CF4-A1-B001',
      cefr: 'A1',
      passed: true,
      checkedPointCount: 1,
      findings: [],
    },
    points: [
      {
        code: 'A1_P1',
        version: 1,
        status: 'READY_FOR_APPROVAL',
        reviewProfile: 'STANDARD',
        grammarJobId: 'grammar-ready',
        grammarHash,
        grammarValidationRunId: 'grammar-validation',
        reviewJobId: 'review-ready',
        reviewRunId: 'review-run',
        reviewReportHash: reviewHash,
        exerciseJobId: 'exercise-ready',
        exerciseHash,
        exerciseValidationRunId: 'exercise-validation',
        exerciseCount: 20,
        errorCode: null,
      },
    ],
    generatedAt: '2026-08-21T00:00:00.000Z',
  };
}

function harness(total = 96) {
  const report = readinessReport();
  const content = `${JSON.stringify(report, null, 2)}\n`;
  const artifact = {
    artifactPath: 'var/content-factory/run/cf4_ready.json',
    artifactType: 'CF4_BATCH_READINESS_REPORT',
    contentHash: computeSha256(content),
    metadataJson: { batchCode: report.batchCode },
  };
  const prisma = {
    contentFactoryArtifact: { findFirst: vi.fn(async () => artifact) },
    contentFactoryRun: {
      findUnique: vi.fn(async () => ({ id: runId, status: 'READY FOR OWNER APPROVAL' })),
      update: vi.fn(async () => ({ id: runId })),
    },
    contentFactoryJob: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === 'grammar-ready') {
          return {
            id: 'grammar-ready',
            runId,
            state: 'READY_FOR_APPROVAL',
            outputHash: grammarHash,
          };
        }
        if (args.where.id === 'review-ready') {
          return {
            id: 'review-ready',
            runId,
            state: 'READY_FOR_APPROVAL',
            inputHash: grammarHash,
            outputHash: reviewHash,
          };
        }
        if (args.where.id === 'exercise-ready') {
          return {
            id: 'exercise-ready',
            runId,
            state: 'READY_FOR_APPROVAL',
            outputHash: exerciseHash,
          };
        }
        return { id: 'historical-failed', runId, state: 'QUARANTINED', outputHash: null };
      }),
    },
    contentValidationRun: {
      findUnique: vi.fn(async (args: { where: { id: string } }) =>
        args.where.id === 'grammar-validation'
          ? { id: 'grammar-validation', runId, passed: true, artifactHash: grammarHash }
          : { id: 'exercise-validation', runId, passed: true, artifactHash: exerciseHash },
      ),
    },
    contentReviewRun: {
      findUnique: vi.fn(async () => ({
        id: 'review-run',
        runId,
        jobId: 'review-ready',
        decision: 'PASS',
        artifactHash: grammarHash,
        reportHash: reviewHash,
        promptVersion: 'cf4-independent-review-v1',
        reviewerProvider: 'OPENAI',
        reviewerModel: 'review-model',
        reportJson: reviewReport(total),
      })),
    },
    contentFactoryApproval: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'approval',
        ...args.data,
      })),
    },
  } as unknown as PrismaClient;
  const orchestrator = {
    getApprovalScopeHash: vi.fn(async () => {
      throw new Error('GENERIC_SCOPE_SHOULD_NOT_BE_USED_FOR_CF4');
    }),
    recordOwnerApproval: vi.fn(),
  } as unknown as ContentFactoryOrchestratorService;
  const storage = {
    readArtifact: vi.fn(() => content),
  } as unknown as ContentFactoryStorageRepository;
  return {
    prisma,
    orchestrator,
    service: new ContentFactoryOwnerApprovalService(prisma, orchestrator, storage),
  };
}

describe('ContentFactoryOwnerApprovalService', () => {
  it('derives CF4 owner scope from final ready evidence rather than historical failed attempts', async () => {
    const { service, orchestrator } = harness();

    const scopeHash = await service.getApprovalScopeHash(runId);

    expect(scopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(orchestrator.getApprovalScopeHash).not.toHaveBeenCalled();
  });

  it('does not allow a stored PASS label to bypass CF4 score thresholds', async () => {
    const { service } = harness(70);

    await expect(service.getApprovalScopeHash(runId)).rejects.toThrow(
      'CF4_APPROVAL_REVIEW_QUALITY_GATE_FAILED:A1_P1',
    );
  });

  it('records CF4 owner approval only with the exact human confirmation token', async () => {
    const { service, prisma } = harness();
    const scopeHash = await service.getApprovalScopeHash(runId);

    await expect(
      service.recordOwnerApproval({
        runId,
        approvedBy: 'owner@example.com',
        rationale: 'Reviewed final CF4 readiness evidence.',
        expectedScopeHash: scopeHash,
        confirmation: `APPROVE:${scopeHash}`,
      }),
    ).resolves.toMatchObject({ scopeHash, decisionSource: 'OWNER_CLI' });
    expect(prisma.contentFactoryApproval.create).toHaveBeenCalledOnce();
    expect(prisma.contentFactoryRun.update).toHaveBeenCalledOnce();
  });
});
