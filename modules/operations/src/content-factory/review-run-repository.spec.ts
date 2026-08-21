import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { ContentReviewReport } from '@english/contracts';
import { computeSha256 } from './idempotency-lease-manager.js';
import { ContentReviewRunRepository } from './review-run-repository.js';

const prisma = new PrismaClient();

describe('ContentReviewRunRepository', () => {
  let runId: string;
  let jobId: string;
  const artifactHash = computeSha256(JSON.stringify({ code: 'A1_REVIEW_AUDIT' }));

  beforeEach(async () => {
    const run = await prisma.contentFactoryRun.create({ data: { status: 'DRAFT ONLY' } });
    runId = run.id;
    const job = await prisma.contentFactoryJob.create({
      data: {
        runId,
        purpose: 'REVIEW',
        targetCode: 'A1_REVIEW_AUDIT',
        state: 'IN_REVIEW',
        idempotencyKey: `review-audit-${runId}`,
        inputHash: artifactHash,
        outputHash: artifactHash,
        policyVersionsJson: { factory: 'content-factory-v1', schema: '1.0', prompt: 'v1' },
        budgetJson: { maxRequests: 1 },
      },
    });
    jobId = job.id;
  });

  afterEach(async () => {
    if (runId) await prisma.contentFactoryRun.delete({ where: { id: runId } }).catch(() => {});
  });

  function report(hash = artifactHash): ContentReviewReport {
    return {
      schemaVersion: '1.0',
      artifactCode: 'A1_REVIEW_AUDIT',
      artifactVersion: 1,
      artifactHash: hash,
      reviewer: {
        provider: 'SECONDARY_OPENAI_COMPATIBLE',
        model: 'reviewer-model',
        promptVersion: 'cf3-independent-review-v1',
        runId,
      },
      decision: 'PASS',
      confidence: 0.95,
      scores: {
        correctness: 30,
        specificity: 14,
        examples: 14,
        vietnamesePedagogy: 10,
        cefrFit: 10,
        evaluatorReadiness: 10,
        originalityDiversity: 4,
        provenanceCompleteness: 4,
        total: 96,
      },
      findings: [],
      reviewedAt: new Date().toISOString(),
    };
  }

  it('persists one immutable review record and de-duplicates redelivery', async () => {
    const repository = new ContentReviewRunRepository(prisma);
    const first = await repository.record({ runId, jobId, report: report() });
    const second = await repository.record({ runId, jobId, report: report() });

    expect(second.id).toBe(first.id);
    expect(await prisma.contentReviewRun.count({ where: { jobId } })).toBe(1);
    expect(first.reviewerModel).toBe('reviewer-model');
    expect(first.qualityScore.toNumber()).toBe(96);
  });

  it('rejects a reviewer report for bytes that are not the job artifact', async () => {
    const repository = new ContentReviewRunRepository(prisma);
    await expect(
      repository.record({ runId, jobId, report: report('f'.repeat(64)) }),
    ).rejects.toThrow('CONTENT_REVIEW_ARTIFACT_HASH_MISMATCH');
    expect(await prisma.contentReviewRun.count({ where: { jobId } })).toBe(0);
  });

  it('rejects review metadata pinned to a different run or artifact identity', async () => {
    const repository = new ContentReviewRunRepository(prisma);
    const wrongRun = report();
    wrongRun.reviewer.runId = '11111111-1111-4111-8111-111111111111';
    await expect(repository.record({ runId, jobId, report: wrongRun })).rejects.toThrow(
      'CONTENT_REVIEW_RUN_ID_MISMATCH',
    );

    const wrongIdentity = report();
    wrongIdentity.artifactCode = 'OTHER_ARTIFACT';
    await expect(repository.record({ runId, jobId, report: wrongIdentity })).rejects.toThrow(
      'CONTENT_REVIEW_ARTIFACT_IDENTITY_MISMATCH',
    );
    expect(await prisma.contentReviewRun.count({ where: { jobId } })).toBe(0);
  });
});
