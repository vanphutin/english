import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { computeSha256 } from './idempotency-lease-manager.js';
import {
  Cf5CurriculumReleaseService,
  type Cf5ReleaseReadinessReport,
} from './cf5-curriculum-release.service.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

const runId = '11111111-1111-4111-8111-111111111111';
const scopeHash = 'a'.repeat(64);
const releaseHash = 'b'.repeat(64);

function readyReport(): Cf5ReleaseReadinessReport {
  return {
    schemaVersion: '1.0',
    phase: 'CF5',
    operation: 'PREPARE_CURRICULUM_RELEASE',
    runId,
    manifestRunId: '22222222-2222-4222-8222-222222222222',
    releaseId: 'new-release',
    releaseCode: 'PERSONAL_ENGLISH',
    releaseVersion: 6,
    releaseContentHash: releaseHash,
    scopeHash,
    status: 'READY_FOR_OWNER_APPROVAL',
    publicationBatchHashes: ['c'.repeat(64)],
    regression: {
      schemaVersion: '1.0',
      phase: 'CF5',
      activeRelease: {
        id: 'old-release',
        code: 'PERSONAL_ENGLISH',
        version: 5,
        contentHash: 'd'.repeat(64),
        pointCount: 235,
      },
      candidateRelease: {
        code: 'PERSONAL_ENGLISH',
        version: 6,
        contentHash: releaseHash,
        pointCount: 240,
      },
      retainedPointCount: 235,
      addedPointCount: 5,
      removedPointCount: 0,
      versionChangeCount: 0,
      activeEnrollmentCount: 1,
      currentLevelMappingsVerified: 1,
      minimumPublishedExercisesPerPoint: 20,
      passed: true,
      findings: [],
    },
    spec: {
      schemaVersion: '1.0',
      code: 'PERSONAL_ENGLISH',
      title: 'Personal English',
      version: 6,
      levels: [
        {
          code: 'LEVEL_A1_FULL',
          cefr: 'A1',
          title: 'A1',
          unlockPolicy: {},
          units: [
            {
              code: 'A1_U01',
              title: 'A1 Unit',
              items: [
                {
                  grammarPointCode: 'A1_P1',
                  grammarPointVersion: 1,
                  role: 'REQUIRED',
                  weight: 1,
                  minimumEvidenceCount: 5,
                },
              ],
            },
          ],
        },
        {
          code: 'LEVEL_B2_FULL',
          cefr: 'B2',
          title: 'B2',
          unlockPolicy: {},
          units: [
            {
              code: 'B2_U01',
              title: 'B2 Unit',
              items: [
                {
                  grammarPointCode: 'B2_P1',
                  grammarPointVersion: 1,
                  role: 'REQUIRED',
                  weight: 1,
                  minimumEvidenceCount: 5,
                },
              ],
            },
          ],
        },
      ],
    },
    generatedAt: '2026-08-21T00:00:00.000Z',
  };
}

function storageWith(report: Cf5ReleaseReadinessReport): ContentFactoryStorageRepository {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  return {
    readArtifact: vi.fn(() => content),
  } as unknown as ContentFactoryStorageRepository;
}

describe('Cf5CurriculumReleaseService', () => {
  it('requires the exact activation token before reading any state', async () => {
    const findFirst = vi.fn();
    const prisma = {
      contentFactoryArtifact: { findFirst },
    } as unknown as PrismaClient;
    const service = new Cf5CurriculumReleaseService(prisma, storageWith(readyReport()));

    await expect(
      service.activateRelease({
        runId,
        expectedScopeHash: scopeHash,
        confirmation: 'ACTIVATE:wrong',
      }),
    ).rejects.toThrow('CF5_RELEASE_ACTIVATION_CONFIRMATION_MISMATCH');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('migrates an active B2 learner to B2 of the new release before activation', async () => {
    const report = readyReport();
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const enrollmentUpsert = vi.fn(async () => ({ id: 'new-enrollment' }));
    const levelProgressUpsert = vi.fn(async () => ({ userId: 'user-1' }));
    const previousReleaseFind = vi.fn(async () => ({
      id: 'old-release',
      enrollments: [{ userId: 'user-1', currentLevel: { cefrLevel: 'B2' } }],
    }));
    const tx = {
      contentPublication: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'activation-publication' })),
      },
      curriculumRelease: {
        findUnique: vi.fn(async () => ({
          id: 'new-release',
          curriculumId: 'curriculum-id',
          versionNo: 6,
          status: 'DRAFT',
          contentHash: releaseHash,
          levels: [
            { id: 'new-a1', cefrLevel: 'A1', sortOrder: 0 },
            { id: 'new-b2', cefrLevel: 'B2', sortOrder: 1 },
          ],
        })),
        findFirst: previousReleaseFind,
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({ id: 'new-release' })),
      },
      userCurriculumEnrollment: { upsert: enrollmentUpsert },
      levelProgress: {
        findFirst: vi.fn(async () => ({ progressScore: 64, unlockedAt: new Date('2026-01-01') })),
        upsert: levelProgressUpsert,
      },
      curriculum: { update: vi.fn(async () => ({ id: 'curriculum-id' })) },
    };
    const prisma = {
      contentFactoryArtifact: {
        findFirst: vi.fn(async () => ({
          artifactPath: 'var/content-factory/run/cf5-ready.json',
          contentHash: computeSha256(content),
        })),
      },
      contentFactoryRun: {
        findUnique: vi.fn(async () => ({ status: 'OWNER APPROVED', manifestHash: scopeHash })),
      },
      contentFactoryApproval: { findFirst: vi.fn(async () => ({ id: 'approval-id' })) },
      contentPublication: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaClient;
    const service = new Cf5CurriculumReleaseService(prisma, storageWith(report));

    const result = await service.activateRelease({
      runId,
      expectedScopeHash: scopeHash,
      confirmation: `ACTIVATE:${scopeHash}`,
    });

    expect(result.migratedEnrollmentCount).toBe(1);
    expect(enrollmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentLevelId: 'new-b2', status: 'ACTIVE' }),
        update: expect.objectContaining({ currentLevelId: 'new-b2', status: 'ACTIVE' }),
      }),
    );
    expect(levelProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ curriculumLevelId: 'new-b2', progressScore: 64 }),
      }),
    );
    expect(previousReleaseFind).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          enrollments: expect.objectContaining({ where: { status: 'ACTIVE' } }),
        }),
      }),
    );
  });
});
