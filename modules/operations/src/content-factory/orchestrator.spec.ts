import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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

  it('atomically claims next QUEUED job with worker lease', async () => {
    const inputContent = JSON.stringify({ code: 'PILOT_POINT_2', license: 'PUBLIC_CONTENT' });
    await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_2',
      inputContent,
    });

    const claimedJob = await orchestrator.claimNextJob('worker-node-1', testRunId, 5);

    expect(claimedJob).not.toBeNull();
    expect(claimedJob?.state).toBe('CLAIMED');
    expect(claimedJob?.workerId).toBe('worker-node-1');
    expect(claimedJob?.leaseExpiresAt).not.toBeNull();
  });

  it('enforces worker lease ownership during state transitions', async () => {
    const inputContent = JSON.stringify({ code: 'PILOT_POINT_3', license: 'PUBLIC_CONTENT' });
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'PILOT_POINT_3',
      inputContent,
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 10);

    // Unauthorized worker should fail
    await expect(
      orchestrator.advanceJobState(job.id, 'unauthorized-worker-2', 'GENERATING'),
    ).rejects.toThrow('Worker unauthorized-worker-2 does not hold an active lease');

    // Authorized worker succeeds
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
    const invalidManifestContent = JSON.stringify({ code: 'INVALID_MANIFEST' });
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'INVALID_MANIFEST',
      inputContent: invalidManifestContent,
    });

    await orchestrator.claimNextJob('worker-node-1', testRunId, 5);
    const resultJob = await orchestrator.validateManifestJob(job.id, 'worker-node-1');

    expect(resultJob.state).toBe('QUARANTINED');
    expect(resultJob.normalizedErrorCode).toBe('SCHEMA_VALIDATION_FAILED');
  });

  it('records owner approval with hash integrity', async () => {
    const inputContent = JSON.stringify({ code: 'APPROVED_POINT', license: 'PUBLIC_CONTENT' });
    const { job } = await orchestrator.enqueueJob({
      runId: testRunId,
      purpose: 'PLAN_MANIFEST',
      targetCode: 'APPROVED_POINT',
      inputContent,
    });

    await prisma.contentFactoryJob.update({
      where: { id: job.id },
      data: { state: 'READY_FOR_APPROVAL', outputHash: job.inputHash },
    });
    const scopeHash = await orchestrator.getApprovalScopeHash(testRunId);
    const approval = await orchestrator.recordOwnerApproval({
      runId: testRunId,
      approvedBy: 'Owner',
      rationale: 'Approval for CF1 test',
      expectedScopeHash: scopeHash,
      confirmation: `APPROVE:${scopeHash}`,
    });

    expect(approval.approvedBy).toBe('Owner');
    expect(approval.scopeHash).toBeDefined();
    expect(approval.approvalHash).toBeDefined();

    const run = await prisma.contentFactoryRun.findUnique({ where: { id: testRunId } });
    expect(run?.status).toBe('OWNER APPROVED');
  });
});
