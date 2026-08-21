import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';

const prisma = new PrismaClient();
const storageDir = path.resolve(__dirname, '../../../../var/test-cf-idempotency-run-isolation');
const createdRunIds: string[] = [];

afterAll(async () => {
  for (const runId of createdRunIds) {
    await prisma.contentFactoryRun.delete({ where: { id: runId } }).catch(() => {});
  }
  await prisma.$disconnect();
  if (fs.existsSync(storageDir)) fs.rmSync(storageDir, { recursive: true, force: true });
});

describe('Content Factory run-scoped idempotency', () => {
  it('creates distinct jobs for identical semantic input in different runs', async () => {
    const orchestrator = new ContentFactoryOrchestratorService(prisma, storageDir);
    const firstRun = await orchestrator.startRun();
    const secondRun = await orchestrator.startRun();
    createdRunIds.push(firstRun.id, secondRun.id);

    const inputContent = JSON.stringify({ code: 'A1_RUN_ISOLATION', license: 'PUBLIC_CONTENT' });
    const common = {
      purpose: 'AUTHOR_GRAMMAR' as const,
      targetCode: 'A1_RUN_ISOLATION',
      targetVersion: 1,
      inputContent,
      policyVersions: {
        factory: 'content-factory-v1' as const,
        schema: '1.0',
        prompt: 'cf3-grammar-author-v1',
      },
    };

    const first = await orchestrator.enqueueJob({ runId: firstRun.id, ...common });
    const second = await orchestrator.enqueueJob({ runId: secondRun.id, ...common });

    expect(first.job.id).not.toBe(second.job.id);
    expect(first.job.idempotencyKey).not.toBe(second.job.idempotencyKey);
    expect(first.job.runId).toBe(firstRun.id);
    expect(second.job.runId).toBe(secondRun.id);
    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(false);
  });
});
