import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Cf4ExecutionControl } from './cf4-execution-control.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

function storage(): ContentFactoryStorageRepository {
  return {
    saveArtifact: vi.fn((_runId: string, filename: string, content: string) => ({
      artifactPath: `var/content-factory/run/${filename}`,
      storageUri: `file:///tmp/${filename}`,
      contentHash: `hash-${content.length}`,
      created: true,
    })),
    removeArtifact: vi.fn(),
  } as unknown as ContentFactoryStorageRepository;
}

describe('Cf4ExecutionControl', () => {
  it('persists retry attempts as immutable attempt 2/3 job identities', async () => {
    const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'job-2',
      ...args.data,
      artifacts: [],
    }));
    const prisma = {
      contentFactoryRun: { findUnique: vi.fn(async () => ({ id: 'run-id' })) },
      contentFactoryJob: {
        findUnique: vi.fn(async () => null),
        create,
      },
    } as unknown as PrismaClient;
    const control = new Cf4ExecutionControl(prisma, storage());

    const result = await control.enqueueAttempt({
      runId: '11111111-1111-4111-8111-111111111111',
      purpose: 'AUTHOR_GRAMMAR',
      targetCode: 'A1_TEST',
      targetVersion: 1,
      inputContent: '{"attempt":2}',
      attempt: 2,
      policyVersions: {
        factory: 'content-factory-v1',
        schema: '1.0',
        prompt: 'cf4-grammar-author-v1',
      },
    });

    expect(result.isDuplicate).toBe(false);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].data.attempt).toBe(2);
    expect(String(create.mock.calls[0]?.[0].data.idempotencyKey)).toContain('-att2-');
  });

  it('fails closed when the atomic run budget reservation cannot fit', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => []),
      contentFactoryRun: { findUnique: vi.fn(async () => ({ id: 'run-id' })) },
    } as unknown as PrismaClient;
    const control = new Cf4ExecutionControl(prisma, storage());

    await expect(
      control.reserveRunBudget('11111111-1111-4111-8111-111111111111', {
        requests: 1,
        inputTokens: 100,
        outputTokens: 500,
        estimatedCost: 0.1,
      }),
    ).rejects.toThrow('CF4_RUN_BUDGET_EXHAUSTED');
  });

  it('rejects invalid budget reservations before touching the database', async () => {
    const query = vi.fn();
    const prisma = { $queryRaw: query } as unknown as PrismaClient;
    const control = new Cf4ExecutionControl(prisma, storage());

    await expect(
      control.reserveRunBudget('11111111-1111-4111-8111-111111111111', {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      }),
    ).rejects.toThrow('CF4_BUDGET_REQUESTS_MUST_BE_POSITIVE');
    expect(query).not.toHaveBeenCalled();
  });
});
