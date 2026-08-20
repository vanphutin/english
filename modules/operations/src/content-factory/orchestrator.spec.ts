import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import { canTransitionState } from './job-state-machine.js';

const prisma = new PrismaClient();
const testStorageDir = path.resolve(__dirname, '../../../../var/test-content-factory');

describe('ContentFactoryOrchestratorService (Phase CF1 Durable Orchestration)', () => {
  let orchestrator: ContentFactoryOrchestratorService;
  let testRunId: string;

  beforeEach(async () => {
    orchestrator = new ContentFactoryOrchestratorService(prisma, testStorageDir);
    const run = await orchestrator.startRun({
      maxRequests: 50,
      maxInputTokens: 100000,
      maxOutputTokens: 50000,
      maxEstimatedCost: 5.0,
    });
    testRunId = run.id;
  });

  afterEach(async () => {
    if (testRunId) {
      await prisma.contentFactoryRun.delete({ where: { id: testRunId } }).catch(() => {});
    }
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  it('guarantees idempotency on duplicate job enqueue requests', async () => {
    const inputContent = JSON.stringify({ code: 'PILOT_POINT_1', license: 'PUBLIC_CONTENT' });

    const res1 = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_1',
      inputContent,
    });

    const res2 = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_1',
      inputContent,
    });

    expect(res1.isDuplicate).toBe(false);
    expect(res2.isDuplicate).toBe(true);
    expect(res1.job.id).toBe(res2.job.id);
    expect(res1.job.idempotencyKey).toBe(res2.job.idempotencyKey);
  });

  it('allows only one worker to atomically claim a queued job', async () => {
    await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_2',
      inputContent: JSON.stringify({ code: 'PILOT_POINT_2', license: 'PUBLIC_CONTENT' }),
    });

    const claims = await Promise.all([
      orchestrator.claimNextJob('worker-node-1', testRunId, 5),
      orchestrator.claimNextJob('worker-node-2', testRunId, 5),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.filter((claim) => claim === null)).toHaveLength(1);
  });

  it('reclaims an expired active lease instead of leaving GENERATING work stuck', async () => {
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'AUTHOR_GRAMMAR',
      targetCode: 'PILOT_POINT_3',
      inputContent: JSON.stringify({ code: 'PILOT_POINT_3', license: 'PUBLIC_CONTENT' }),
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 10);
    await orchestrator.advanceJobState(job.id, 'worker-node-1', 'GENERATING');
    await prisma.contentFactoryJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    const reclaimed = await orchestrator.claimNextJob('worker-node-2', testRunId, 5);
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.state).toBe('CLAIMED');
    expect(reclaimed?.workerId).toBe('worker-node-2');
    expect(reclaimed?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects expired workers before they can persist output artifacts', async () => {
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'AUTHOR_GRAMMAR',
      targetCode: 'PILOT_POINT_4',
      inputContent: JSON.stringify({ code: 'PILOT_POINT_4', license: 'PUBLIC_CONTENT' }),
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 10);
    await prisma.contentFactoryJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      orchestrator.advanceJobState(
        job.id,
        'worker-node-1',
        'GENERATING',
        JSON.stringify({ unauthorized: true }),
      ),
    ).rejects.toThrow('does not hold an active lease');

    const outputArtifacts = await prisma.contentFactoryArtifact.count({
      where: { jobId: job.id, artifactType: 'OUTPUT_SNAPSHOT' },
    });
    expect(outputArtifacts).toBe(0);
  });

  it('enforces worker lease ownership during state transitions', async () => {
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_5',
      inputContent: JSON.stringify({ code: 'PILOT_POINT_5', license: 'PUBLIC_CONTENT' }),
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 10);

    await expect(
      orchestrator.advanceJobState(job.id, 'unauthorized-worker-2', 'GENERATING'),
    ).rejects.toThrow('Worker unauthorized-worker-2 does not hold an active lease');

    const updated = await orchestrator.advanceJobState(job.id, 'worker-node-1', 'GENERATING');
    expect(updated.state).toBe('GENERATING');
  });

  it('rejects invalid state transitions according to state machine rules', () => {
    expect(canTransitionState('QUEUED', 'CLAIMED')).toBe(true);
    expect(canTransitionState('QUEUED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionState('SUCCEEDED', 'GENERATING')).toBe(false);
    expect(canTransitionState('QUARANTINED', 'CLAIMED')).toBe(false);
  });

  it('validates manifest and transitions invalid jobs to QUARANTINED', async () => {
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'INVALID_MANIFEST',
      inputContent: JSON.stringify({ code: 'INVALID_MANIFEST' }),
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 5);
    const resultJob = await orchestrator.validateManifestJob(job.id, 'worker-node-1');

    expect(resultJob.state).toBe('QUARANTINED');
    expect(resultJob.normalizedErrorCode).toBe('SCHEMA_VALIDATION_FAILED');
    expect(resultJob.workerId).toBeNull();
    expect(resultJob.leaseExpiresAt).toBeNull();
  });

  it('does not create owner approval without the exact human confirmation token', async () => {
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'OWNER_BOUNDARY_POINT',
      inputContent: JSON.stringify({ code: 'OWNER_BOUNDARY_POINT', license: 'PUBLIC_CONTENT' }),
    });

    await prisma.contentFactoryJob.update({
      where: { id: job.id },
      data: { state: 'READY_FOR_APPROVAL', outputHash: job.inputHash },
    });
    const scopeHash = await orchestrator.getApprovalScopeHash(testRunId);

    await expect(
      orchestrator.recordOwnerApproval({
        runId: testRunId,
        approvedBy: 'AUTOMATED_TEST_ACTOR',
        rationale: 'This automated path must not be accepted as owner approval.',
        expectedScopeHash: scopeHash,
        confirmation: 'NOT_APPROVED',
      }),
    ).rejects.toThrow('OWNER_APPROVAL_HASH_MISMATCH');

    expect(await prisma.contentFactoryApproval.count({ where: { runId: testRunId } })).toBe(0);
    const run = await prisma.contentFactoryRun.findUnique({ where: { id: testRunId } });
    expect(run?.status).toBe('DRAFT ONLY');
  });
});
