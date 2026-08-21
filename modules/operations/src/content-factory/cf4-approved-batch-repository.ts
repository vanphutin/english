import type { PrismaClient } from '@prisma/client';
import { ContentFactoryValidator } from '@english/contracts';
import type { AutonomousManifest } from './manifest-planner.js';
import { Cf4LevelBatchPlanner, type Cf4BatchPlan, type Cf4LevelBatch } from './cf4-level-batch-planner.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

/**
 * Read-only operational repository for CF4. It loads the exact manifest bytes
 * that belong to an owner-approved CF2 run and derives safe bounded batches.
 * It never creates approval or publication records.
 */
export class Cf4ApprovedBatchRepository {
  private readonly validator = new ContentFactoryValidator();
  private readonly planner = new Cf4LevelBatchPlanner();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async loadPlan(manifestRunId: string, maximumBatchSize = 5): Promise<Cf4BatchPlan> {
    const manifest = await this.loadApprovedManifest(manifestRunId);
    return this.planner.plan(manifest, maximumBatchSize);
  }

  public async loadBatch(params: {
    manifestRunId: string;
    batchCode: string;
    maximumBatchSize?: number;
  }): Promise<Cf4LevelBatch> {
    const plan = await this.loadPlan(params.manifestRunId, params.maximumBatchSize ?? 5);
    const batch = plan.levels
      .flatMap((level) => level.batches)
      .find((candidate) => candidate.batchCode === params.batchCode);
    if (!batch) throw new Error(`CF4_BATCH_NOT_FOUND:${params.batchCode}`);
    return batch;
  }

  private async loadApprovedManifest(manifestRunId: string): Promise<AutonomousManifest> {
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: manifestRunId } });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF4_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
    }
    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: manifestRunId, scopeHash: run.manifestHash },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval) throw new Error('CF4_MANIFEST_APPROVAL_EVIDENCE_MISSING');

    const manifestJob = await this.prisma.contentFactoryJob.findFirst({
      where: { runId: manifestRunId, purpose: 'PLAN_MANIFEST' },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!manifestJob) throw new Error('CF4_APPROVED_MANIFEST_JOB_MISSING');
    const input = manifestJob.artifacts.find((artifact) => artifact.artifactType === 'INPUT_SNAPSHOT');
    const filename = input?.artifactPath.split('/').at(-1);
    if (!input || !filename) throw new Error('CF4_APPROVED_MANIFEST_ARTIFACT_MISSING');
    const bytes = this.storage.readArtifact(manifestRunId, filename);
    if (!bytes) throw new Error('CF4_APPROVED_MANIFEST_BYTES_MISSING');
    if (computeSha256(bytes) !== input.contentHash) {
      throw new Error('CF4_APPROVED_MANIFEST_HASH_MISMATCH');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes) as unknown;
    } catch {
      throw new Error('CF4_APPROVED_MANIFEST_JSON_INVALID');
    }
    const validation = this.validator.validateManifestArtifact(parsed, input.artifactPath);
    if (!validation.valid) {
      throw new Error(
        `CF4_APPROVED_MANIFEST_VALIDATION_FAILED:${validation.findings
          .map((finding) => finding.code)
          .join(',')}`,
      );
    }
    return parsed as AutonomousManifest;
  }
}
