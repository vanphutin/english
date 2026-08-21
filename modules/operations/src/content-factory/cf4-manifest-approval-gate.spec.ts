import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type {
  AutonomousManifest,
  CurriculumPointSpec,
} from './manifest-planner.js';
import { Cf4LevelBatchPlanner } from './cf4-level-batch-planner.js';
import { PrismaCf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

function point(code: string, sortOrder: number): CurriculumPointSpec {
  return {
    code,
    family: 'TEST',
    canonicalSlug: code.toLowerCase(),
    titleVi: code,
    titleEn: code,
    assessableDistinction: `Distinction for ${code}`,
    communicativeFunctions: ['test'],
    formBoundary: 'bounded form',
    meaningBoundary: 'bounded meaning',
    useBoundary: 'bounded use',
    prerequisites: [],
    buildsOn: [],
    contrastsWith: [],
    oftenConfusedWith: [],
    vocabularyDomains: ['GENERAL'],
    rationale: 'test fixture',
    sortOrder,
  };
}

function approvedManifest(pointCount = 5): AutonomousManifest {
  return {
    schemaVersion: '1.0',
    manifestCode: 'APPROVED_CF4_TEST',
    version: 1,
    policyVersion: 'content-factory-v1',
    status: 'DRAFT',
    levels: [
      {
        cefr: 'B2',
        titleVi: 'B2',
        sortOrder: 1,
        units: [
          {
            code: 'B2_U01',
            titleVi: 'Unit',
            sortOrder: 1,
            points: Array.from({ length: pointCount }, (_, index) =>
              point(`B2_P${index + 1}`, index + 1),
            ),
          },
        ],
      },
    ],
    provenance: {
      origin: 'DETERMINISTIC_TEMPLATE',
      provider: 'none',
      model: 'none',
      promptVersion: 'test',
      generatedAt: '2026-08-21T00:00:00.000Z',
      licenseClass: 'PUBLIC_CONTENT_ORIGINAL',
    },
  };
}

function fakePrisma(manifest: AutonomousManifest, status = 'OWNER APPROVED'): PrismaClient {
  const content = JSON.stringify(manifest);
  return {
    contentFactoryRun: {
      findUnique: async () => ({ status, manifestHash: 'a'.repeat(64) }),
    },
    contentFactoryApproval: {
      findFirst: async () => ({ id: 'approval' }),
    },
    contentFactoryJob: {
      findFirst: async () => ({
        artifacts: [
          {
            artifactType: 'INPUT_SNAPSHOT',
            artifactPath: 'var/content-factory/run/manifest.json',
            contentHash: computeSha256(content),
          },
        ],
      }),
    },
  } as unknown as PrismaClient;
}

function fakeStorage(
  manifest: AutonomousManifest,
  override?: string,
): ContentFactoryStorageRepository {
  return {
    readArtifact: () => override ?? JSON.stringify(manifest),
  } as unknown as ContentFactoryStorageRepository;
}

describe('PrismaCf4ManifestApprovalGate', () => {
  it('accepts only the exact deterministic batch from the approved manifest', async () => {
    const manifest = approvedManifest();
    const batch = new Cf4LevelBatchPlanner().plan(manifest).levels[0]!.batches[0]!;
    const gate = new PrismaCf4ManifestApprovalGate(
      fakePrisma(manifest),
      fakeStorage(manifest),
    );

    await expect(
      gate.assertApprovedBatch({ manifestRunId: 'manifest-run', batch }),
    ).resolves.toBeUndefined();
  });

  it('replays a non-default safe partition using its pinned maximum batch size', async () => {
    const manifest = approvedManifest(8);
    const batch = new Cf4LevelBatchPlanner().plan(manifest, 4).levels[0]!.batches[0]!;
    const gate = new PrismaCf4ManifestApprovalGate(
      fakePrisma(manifest),
      fakeStorage(manifest),
    );

    expect(batch.plannedMaximumBatchSize).toBe(4);
    await expect(
      gate.assertApprovedBatch({ manifestRunId: 'manifest-run', batch }),
    ).resolves.toBeUndefined();
  });

  it('rejects caller tampering with CF4 policy fields', async () => {
    const manifest = approvedManifest();
    const batch = new Cf4LevelBatchPlanner().plan(manifest).levels[0]!.batches[0]!;
    const gate = new PrismaCf4ManifestApprovalGate(
      fakePrisma(manifest),
      fakeStorage(manifest),
    );

    await expect(
      gate.assertApprovedBatch({
        manifestRunId: 'manifest-run',
        batch: { ...batch, exerciseTargetPerPoint: 12 },
      }),
    ).rejects.toThrow(`CF4_BATCH_DIFFERS_FROM_APPROVED_MANIFEST:${batch.batchCode}`);
  });

  it('rejects tampered approved-manifest bytes before deterministic replay', async () => {
    const manifest = approvedManifest();
    const batch = new Cf4LevelBatchPlanner().plan(manifest).levels[0]!.batches[0]!;
    const gate = new PrismaCf4ManifestApprovalGate(
      fakePrisma(manifest),
      fakeStorage(manifest, `${JSON.stringify(manifest)} `),
    );

    await expect(
      gate.assertApprovedBatch({ manifestRunId: 'manifest-run', batch }),
    ).rejects.toThrow('CF4_APPROVED_MANIFEST_HASH_MISMATCH');
  });

  it('rejects authoring when the manifest run is not owner approved', async () => {
    const manifest = approvedManifest();
    const batch = new Cf4LevelBatchPlanner().plan(manifest).levels[0]!.batches[0]!;
    const gate = new PrismaCf4ManifestApprovalGate(
      fakePrisma(manifest, 'DRAFT ONLY'),
      fakeStorage(manifest),
    );

    await expect(
      gate.assertApprovedBatch({ manifestRunId: 'manifest-run', batch }),
    ).rejects.toThrow('CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
  });
});
