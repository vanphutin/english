import type { PrismaClient } from '@prisma/client';
import type { AutonomousManifest, CurriculumPointSpec } from './manifest-planner.js';
import type { PilotGrammarTarget } from './lesson-generator.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

export interface Cf3ManifestApprovalGate {
  assertApprovedTargets(params: {
    manifestRunId: string;
    targets: PilotGrammarTarget[];
  }): Promise<void>;
}

/**
 * Production CF3 gate: authoring is allowed only for exact A1 manifest items
 * whose CF2 run carries a real owner-approval record matching the run scope hash.
 */
export class PrismaCf3ManifestApprovalGate implements Cf3ManifestApprovalGate {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async assertApprovedTargets(params: {
    manifestRunId: string;
    targets: PilotGrammarTarget[];
  }): Promise<void> {
    const approvedA1Points = await this.loadApprovedA1Targets(params.manifestRunId);
    const byCode = new Map(approvedA1Points.map((point) => [point.code, point]));

    for (const target of params.targets) {
      const approvedPoint = byCode.get(target.code);
      if (!approvedPoint) throw new Error(`CF3_TARGET_NOT_IN_APPROVED_MANIFEST:${target.code}`);
      if (!this.samePoint(target, approvedPoint)) {
        throw new Error(`CF3_TARGET_DIFFERS_FROM_APPROVED_MANIFEST:${target.code}`);
      }
    }
  }

  /** Returns exact A1 manifest items only after owner-approval evidence is verified. */
  public async loadApprovedA1Targets(manifestRunId: string): Promise<PilotGrammarTarget[]> {
    const run = await this.prisma.contentFactoryRun.findUnique({
      where: { id: manifestRunId },
    });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF3_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
    }

    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: manifestRunId, scopeHash: run.manifestHash },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval) throw new Error('CF3_MANIFEST_APPROVAL_EVIDENCE_MISSING');

    const manifestJob = await this.prisma.contentFactoryJob.findFirst({
      where: { runId: manifestRunId, purpose: 'PLAN_MANIFEST' },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!manifestJob) throw new Error('CF3_APPROVED_MANIFEST_JOB_MISSING');

    const inputArtifact = manifestJob.artifacts.find(
      (artifact) => artifact.artifactType === 'INPUT_SNAPSHOT',
    );
    const filename = inputArtifact?.artifactPath.split('/').at(-1);
    if (!filename) throw new Error('CF3_APPROVED_MANIFEST_ARTIFACT_MISSING');
    const content = this.storage.readArtifact(manifestRunId, filename);
    if (!content) throw new Error('CF3_APPROVED_MANIFEST_BYTES_MISSING');

    const manifest = JSON.parse(content) as AutonomousManifest;
    return manifest.levels
      .filter((level) => level.cefr === 'A1')
      .flatMap((level) =>
        level.units.flatMap((unit) =>
          unit.points.map((point) => ({ ...point, cefr: 'A1' as const })),
        ),
      );
  }

  private samePoint(target: PilotGrammarTarget, approved: CurriculumPointSpec): boolean {
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
      (field) => JSON.stringify(target[field]) === JSON.stringify(approved[field]),
    );
  }
}
