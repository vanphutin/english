import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Cf4ApprovedBatchRepository } from './cf4-approved-batch-repository.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

describe('Cf4ApprovedBatchRepository', () => {
  it('rejects a manifest run that is not owner approved before reading storage', async () => {
    const prisma = {
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({ status: 'DRAFT ONLY', manifestHash: null })),
      },
    } as unknown as PrismaClient;
    const readArtifact = vi.fn();
    const storage = { readArtifact } as unknown as ContentFactoryStorageRepository;
    const repository = new Cf4ApprovedBatchRepository(prisma, storage);

    await expect(repository.loadPlan('manifest-run')).rejects.toThrow(
      'CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN',
    );
    expect(readArtifact).not.toHaveBeenCalled();
  });

  it('rejects an owner-approved run that has no matching approval evidence', async () => {
    const prisma = {
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({
          status: 'OWNER APPROVED',
          manifestHash: 'a'.repeat(64),
        })),
      },
      contentFactoryApproval: { findFirst: vi.fn(async () => null) },
    } as unknown as PrismaClient;
    const repository = new Cf4ApprovedBatchRepository(
      prisma,
      { readArtifact: vi.fn() } as unknown as ContentFactoryStorageRepository,
    );

    await expect(repository.loadPlan('manifest-run')).rejects.toThrow(
      'CF4_MANIFEST_APPROVAL_EVIDENCE_MISSING',
    );
  });
});
