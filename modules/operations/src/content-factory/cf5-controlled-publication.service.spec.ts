import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Cf5ControlledPublicationService } from './cf5-controlled-publication.service.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

const scopeHash = 'a'.repeat(64);

function storage(): ContentFactoryStorageRepository {
  return { readArtifact: vi.fn() } as unknown as ContentFactoryStorageRepository;
}

describe('Cf5ControlledPublicationService', () => {
  it('requires the exact human publication confirmation before touching the database', async () => {
    const findUnique = vi.fn();
    const prisma = {
      contentFactoryRun: { findUnique },
    } as unknown as PrismaClient;
    const service = new Cf5ControlledPublicationService(prisma, storage());

    await expect(
      service.publishApprovedBatch({
        runId: 'run-id',
        expectedScopeHash: scopeHash,
        confirmation: 'PUBLISH:wrong',
      }),
    ).rejects.toThrow('CF5_PUBLICATION_CONFIRMATION_MISMATCH');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects publication when the CF4 run is not owner approved', async () => {
    const prisma = {
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({ status: 'READY FOR OWNER APPROVAL', manifestHash: scopeHash })),
      },
    } as unknown as PrismaClient;
    const service = new Cf5ControlledPublicationService(prisma, storage());

    await expect(
      service.publishApprovedBatch({
        runId: 'run-id',
        expectedScopeHash: scopeHash,
        confirmation: `PUBLISH:${scopeHash}`,
      }),
    ).rejects.toThrow('CF5_REQUIRES_OWNER_APPROVED_CF4_RUN');
  });

  it('returns the exact existing publication on idempotent replay without opening a transaction', async () => {
    const result = {
      schemaVersion: '1.0',
      phase: 'CF5',
      operation: 'PUBLISH_APPROVED_CF4_BATCH',
      runId: 'run-id',
      manifestRunId: 'manifest-run',
      batchCode: 'CF4-A1-B001',
      batchHash: scopeHash,
      approvalId: 'approval-id',
      pointCount: 1,
      exerciseCount: 20,
      points: [
        {
          code: 'A1_P1',
          version: 1,
          grammarPointVersionId: 'version-id',
          grammarHash: 'b'.repeat(64),
          exerciseHash: 'c'.repeat(64),
          exerciseCount: 20,
        },
      ],
      publishedAt: '2026-08-21T00:00:00.000Z',
    };
    const transaction = vi.fn();
    const prisma = {
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({ status: 'OWNER APPROVED', manifestHash: scopeHash })),
      },
      contentFactoryApproval: { findFirst: vi.fn(async () => ({ id: 'approval-id' })) },
      contentPublication: {
        findUnique: vi.fn(async () => ({
          runId: 'run-id',
          approvalId: 'approval-id',
          status: 'PUBLISHED',
          resultJson: result,
        })),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const service = new Cf5ControlledPublicationService(prisma, storage());

    await expect(
      service.publishApprovedBatch({
        runId: 'run-id',
        expectedScopeHash: scopeHash,
        confirmation: `PUBLISH:${scopeHash}`,
      }),
    ).resolves.toEqual(result);
    expect(transaction).not.toHaveBeenCalled();
  });
});
