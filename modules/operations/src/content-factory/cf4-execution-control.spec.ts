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
  it('persists retry attempts as attempt 2/3 identities', async () => {
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
      inputContent: '{"approved":true}',
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

  it('fails closed when an atomic per-call budget reservation does not fit', async () => {
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

  it('charges a multi-request initial envelope only once across replay', async () => {
    let marker: { contentHash: string } | null = null;
    const queryRaw = vi.fn(async () =>
      queryRaw.mock.calls.length === 2 ? [{ id: 'run-id' }] : [],
    );
    const create = vi.fn(async (args: { data: { contentHash: string } }) => {
      marker = { contentHash: args.data.contentHash };
      return { id: 'marker' };
    });
    const tx = {
      $queryRaw: queryRaw,
      contentFactoryArtifact: {
        findFirst: vi.fn(async () => marker),
        create,
      },
      contentFactoryRun: { findUnique: vi.fn(async () => ({ id: 'run-id' })) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaClient;
    const control = new Cf4ExecutionControl(prisma, storage());
    const reservation = {
      requests: 9,
      inputTokens: 1000,
      outputTokens: 2000,
      estimatedCost: 0.5,
    };

    await expect(
      control.reserveRunBudget('11111111-1111-4111-8111-111111111111', reservation),
    ).resolves.toEqual(reservation);
    await expect(
      control.reserveRunBudget('11111111-1111-4111-8111-111111111111', reservation),
    ).resolves.toEqual(reservation);

    expect(create).toHaveBeenCalledOnce();
    // First invocation: advisory lock + budget UPDATE. Replay: advisory lock only.
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('binds a run to one CF4 batch scope and rejects a different scope', async () => {
    let marker: { contentHash: string } | null = null;
    const create = vi.fn(async (args: { data: { contentHash: string } }) => {
      marker = { contentHash: args.data.contentHash };
      return { id: 'scope-marker' };
    });
    const tx = {
      $queryRaw: vi.fn(async () => []),
      contentFactoryArtifact: {
        findFirst: vi.fn(async () => marker),
        create,
      },
      contentFactoryRun: { findUnique: vi.fn(async () => ({ id: 'run-id' })) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaClient;
    const control = new Cf4ExecutionControl(prisma, storage());
    const base = {
      phase: 'CF4' as const,
      manifestRunId: 'manifest-run',
      batchCode: 'CF4-A1-B001',
      plannedMaximumBatchSize: 5,
      targetVersion: 1,
    };

    await expect(
      control.assertOrBindRunScope({ runId: 'run-id', scope: base }),
    ).resolves.toMatchObject({ reused: false });
    await expect(
      control.assertOrBindRunScope({ runId: 'run-id', scope: base }),
    ).resolves.toMatchObject({ reused: true });
    await expect(
      control.assertOrBindRunScope({
        runId: 'run-id',
        scope: { ...base, batchCode: 'CF4-A1-B002' },
      }),
    ).rejects.toThrow('CF4_RUN_SCOPE_MISMATCH');
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects invalid reservations before touching the database', async () => {
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
