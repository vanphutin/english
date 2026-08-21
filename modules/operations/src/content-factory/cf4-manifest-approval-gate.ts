import type { PrismaClient } from '@prisma/client';
import type { AutonomousManifest, CurriculumPointSpec } from './manifest-planner.js';
import {
  Cf4LevelBatchPlanner,
  type Cf4BatchPoint,
  type Cf4LevelBatch,
} from './cf4-level-batch-planner.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

export interface Cf4ManifestApprovalGate {
  assertApprovedBatch(params: {
    manifestRunId: string;
    batch: Cf4LevelBatch;
  }): Promise<void>;
}

/**
 * CF4 production gate. A level batch is authorable only when it is exactly one
 * deterministic batch derived from the immutable owner-approved CF2 manifest.
 * The caller cannot swap points, levels, review profiles, exercise targets, or
 * the batch partitioning parameter after approval.
 */
export class PrismaCf4ManifestApprovalGate implements Cf4ManifestApprovalGate {
  private readonly planner = new Cf4LevelBatchPlanner();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async assertApprovedBatch(params: {
    manifestRunId: string;
    batch: Cf4LevelBatch;
  }): Promise<void> {
    const run = await this.prisma.contentFactoryRun.findUnique({
      where: { id: params.manifestRunId },
    });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
    }

    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: params.manifestRunId, scopeHash: run.manifestHash },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval) throw new Error('CF4_MANIFEST_APPROVAL_EVIDENCE_MISSING');

    const manifestJob = await this.prisma.contentFactoryJob.findFirst({
      where: { runId: params.manifestRunId, purpose: 'PLAN_MANIFEST' },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!manifestJob) throw new Error('CF4_APPROVED_MANIFEST_JOB_MISSING');

    const inputArtifact = manifestJob.artifacts.find(
      (artifact) => artifact.artifactType === 'INPUT_SNAPSHOT',
    );
    const filename = inputArtifact?.artifactPath.split('/').at(-1);
    if (!filename) throw new Error('CF4_APPROVED_MANIFEST_ARTIFACT_MISSING');
    const content = this.storage.readArtifact(params.manifestRunId, filename);
    if (!content) throw new Error('CF4_APPROVED_MANIFEST_BYTES_MISSING');

    const manifest = JSON.parse(content) as AutonomousManifest;
    const expectedPlan = this.planner.plan(manifest, params.batch.plannedMaximumBatchSize);
    const expectedBatch = expectedPlan.levels
      .flatMap((level) => level.batches)
      .find((batch) => batch.batchCode === params.batch.batchCode);

    if (!expectedBatch) throw new Error(`CF4_BATCH_NOT_IN_APPROVED_MANIFEST:${params.batch.batchCode}`);
    if (!this.sameBatch(params.batch, expectedBatch)) {
      throw new Error(`CF4_BATCH_DIFFERS_FROM_APPROVED_MANIFEST:${params.batch.batchCode}`);
    }
  }

  private sameBatch(actual: Cf4LevelBatch, expected: Cf4LevelBatch): boolean {
    if (
      actual.batchCode !== expected.batchCode ||
      actual.cefr !== expected.cefr ||
      actual.batchIndex !== expected.batchIndex ||
      actual.plannedMaximumBatchSize !== expected.plannedMaximumBatchSize ||
      actual.reviewProfile !== expected.reviewProfile ||
      actual.exerciseTargetPerPoint !== expected.exerciseTargetPerPoint ||
      actual.requiresRegressionAfterBatch !== expected.requiresRegressionAfterBatch ||
      actual.requiresOwnerApprovalBeforePublish !== expected.requiresOwnerApprovalBeforePublish ||
      actual.points.length !== expected.points.length
    ) {
      return false;
    }

    return actual.points.every((point, index) => this.samePoint(point, expected.points[index]));
  }

  private samePoint(actual: Cf4BatchPoint, expected: Cf4BatchPoint): boolean {
    if (actual.cefr !== expected.cefr || actual.unitCode !== expected.unitCode) return false;
    const fields: Array<keyof CurriculumPointSpec> = [
      'code',
      'family',
      'canonicalSlug',
      'titleVi',
      'titleEn',
      'assessableDistinction',
      'communicativeFunctions',
      'formBoundary',
      'meaningBoundary',
      'useBoundary',
      'prerequisites',
      'buildsOn',
      'contrastsWith',
      'oftenConfusedWith',
      'vocabularyDomains',
      'rationale',
      'sortOrder',
    ];
    return fields.every(
      (field) => JSON.stringify(actual[field]) === JSON.stringify(expected[field]),
    );
  }
}
