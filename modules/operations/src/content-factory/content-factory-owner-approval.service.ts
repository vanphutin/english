import type { PrismaClient } from '@prisma/client';
import { validateContentReviewReport } from '@english/contracts';
import { computeSha256 } from './idempotency-lease-manager.js';
import type {
  Cf4BatchPointResult,
  Cf4BatchReadinessReport,
} from './cf4-level-batch.service.js';
import {
  getContentReviewPolicy,
  isContentReviewReady,
} from './independent-reviewer.js';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

interface Cf4ReadinessArtifactRef {
  artifactPath: string;
  contentHash: string;
  metadataJson: unknown;
}

/**
 * Human-approval boundary shared by manifest and CF4 runs.
 *
 * Historical failed/revised CF4 attempts remain immutable audit evidence and do
 * not poison the final owner scope. Instead, CF4 approval is derived from the
 * latest verified READY_FOR_APPROVAL batch report and its exact authoritative
 * grammar/review/exercise hashes. This service cannot publish content.
 */
export class ContentFactoryOwnerApprovalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: ContentFactoryOrchestratorService,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async getApprovalScopeHash(runId: string): Promise<string> {
    const cf4Artifact = await this.findLatestCf4ReadinessArtifact(runId);
    if (!cf4Artifact) return this.orchestrator.getApprovalScopeHash(runId);

    const report = await this.loadVerifiedCf4Report(runId, cf4Artifact);
    await this.assertCf4Evidence(runId, report);
    return this.computeCf4ScopeHash(report);
  }

  /**
   * Records only an explicit human decision. Agents may prepare the scope hash
   * and rationale but must never synthesize approvedBy or APPROVE:<scopeHash>.
   */
  public async recordOwnerApproval(params: {
    runId: string;
    approvedBy: string;
    rationale: string;
    expectedScopeHash: string;
    confirmation: string;
  }) {
    const cf4Artifact = await this.findLatestCf4ReadinessArtifact(params.runId);
    if (!cf4Artifact) return this.orchestrator.recordOwnerApproval(params);

    const scopeHash = await this.getApprovalScopeHash(params.runId);
    if (
      scopeHash !== params.expectedScopeHash ||
      params.confirmation !== `APPROVE:${scopeHash}`
    ) {
      throw new Error('OWNER_APPROVAL_HASH_MISMATCH');
    }
    const approvedBy = params.approvedBy.trim();
    const rationale = params.rationale.trim();
    if (!approvedBy || !rationale) {
      throw new Error('OWNER_APPROVAL_IDENTITY_AND_RATIONALE_REQUIRED');
    }

    const approvalHash = computeSha256(
      `${params.runId}:${approvedBy}:${scopeHash}:${rationale}`,
    );
    const requestHash = computeSha256(
      JSON.stringify({
        runId: params.runId,
        approvedBy,
        rationale,
        expectedScopeHash: params.expectedScopeHash,
        confirmation: params.confirmation,
      }),
    );
    const existing = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: params.runId, scopeHash },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new Error('OWNER_APPROVAL_ALREADY_RECORDED');
      }
      return existing;
    }

    const approval = await this.prisma.contentFactoryApproval.create({
      data: {
        runId: params.runId,
        approvedBy,
        scopeHash,
        approvalHash,
        rationale,
        requestHash,
        decisionSource: 'OWNER_CLI',
      },
    });
    await this.prisma.contentFactoryRun.update({
      where: { id: params.runId },
      data: { status: 'OWNER APPROVED', manifestHash: scopeHash },
    });
    return approval;
  }

  private async findLatestCf4ReadinessArtifact(runId: string) {
    return this.prisma.contentFactoryArtifact.findFirst({
      where: { runId, artifactType: 'CF4_BATCH_READINESS_REPORT' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async loadVerifiedCf4Report(
    runId: string,
    artifact: Cf4ReadinessArtifactRef,
  ): Promise<Cf4BatchReadinessReport> {
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'READY FOR OWNER APPROVAL') {
      throw new Error('RUN_NOT_READY_FOR_OWNER_APPROVAL');
    }
    const filename = artifact.artifactPath.split('/').at(-1);
    if (!filename) throw new Error('CF4_READINESS_ARTIFACT_PATH_INVALID');
    const content = this.storage.readArtifact(runId, filename);
    if (!content || computeSha256(content) !== artifact.contentHash) {
      throw new Error('CF4_READINESS_ARTIFACT_HASH_MISMATCH');
    }

    let report: Cf4BatchReadinessReport;
    try {
      report = JSON.parse(content) as Cf4BatchReadinessReport;
    } catch {
      throw new Error('CF4_READINESS_REPORT_JSON_INVALID');
    }
    if (
      report.schemaVersion !== '1.0' ||
      report.phase !== 'CF4' ||
      report.runId !== runId ||
      report.status !== 'READY_FOR_APPROVAL' ||
      !report.regression?.passed ||
      report.readyCount !== report.targetCount ||
      report.targetCount !== report.points.length ||
      report.points.some((point) => point.status !== 'READY_FOR_APPROVAL')
    ) {
      throw new Error('CF4_READINESS_REPORT_NOT_APPROVABLE');
    }
    const metadata = artifact.metadataJson;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as Record<string, unknown>).batchCode !== report.batchCode
    ) {
      throw new Error('CF4_READINESS_REPORT_METADATA_MISMATCH');
    }
    return report;
  }

  private async assertCf4Evidence(
    runId: string,
    report: Cf4BatchReadinessReport,
  ): Promise<void> {
    const codes = new Set<string>();
    for (const point of report.points) {
      if (codes.has(point.code)) throw new Error('CF4_APPROVAL_DUPLICATE_POINT_CODE');
      codes.add(point.code);
      await this.assertPointEvidence(
        runId,
        point,
        report.exerciseTargetPerPoint,
        report.reviewProfile,
      );
    }
  }

  private async assertPointEvidence(
    runId: string,
    point: Cf4BatchPointResult,
    expectedExerciseCount: number,
    expectedReviewProfile: Cf4BatchReadinessReport['reviewProfile'],
  ): Promise<void> {
    if (
      !point.grammarJobId ||
      !point.grammarHash ||
      !point.grammarValidationRunId ||
      !point.reviewJobId ||
      !point.reviewRunId ||
      !point.reviewReportHash ||
      !point.exerciseJobId ||
      !point.exerciseHash ||
      !point.exerciseValidationRunId ||
      point.reviewProfile !== expectedReviewProfile ||
      point.exerciseCount !== expectedExerciseCount ||
      point.errorCode
    ) {
      throw new Error(`CF4_APPROVAL_EVIDENCE_INCOMPLETE:${point.code}`);
    }

    const [grammarJob, reviewJob, exerciseJob, grammarValidation, reviewRun, exerciseValidation] =
      await Promise.all([
        this.prisma.contentFactoryJob.findUnique({ where: { id: point.grammarJobId } }),
        this.prisma.contentFactoryJob.findUnique({ where: { id: point.reviewJobId } }),
        this.prisma.contentFactoryJob.findUnique({ where: { id: point.exerciseJobId } }),
        this.prisma.contentValidationRun.findUnique({
          where: { id: point.grammarValidationRunId },
        }),
        this.prisma.contentReviewRun.findUnique({ where: { id: point.reviewRunId } }),
        this.prisma.contentValidationRun.findUnique({
          where: { id: point.exerciseValidationRunId },
        }),
      ]);

    if (
      !grammarJob ||
      grammarJob.runId !== runId ||
      grammarJob.state !== 'READY_FOR_APPROVAL' ||
      grammarJob.outputHash !== point.grammarHash
    ) {
      throw new Error(`CF4_APPROVAL_GRAMMAR_EVIDENCE_MISMATCH:${point.code}`);
    }
    if (
      !reviewJob ||
      reviewJob.runId !== runId ||
      reviewJob.state !== 'READY_FOR_APPROVAL' ||
      reviewJob.inputHash !== point.grammarHash ||
      reviewJob.outputHash !== point.reviewReportHash
    ) {
      throw new Error(`CF4_APPROVAL_REVIEW_JOB_MISMATCH:${point.code}`);
    }
    if (
      !exerciseJob ||
      exerciseJob.runId !== runId ||
      exerciseJob.state !== 'READY_FOR_APPROVAL' ||
      exerciseJob.outputHash !== point.exerciseHash
    ) {
      throw new Error(`CF4_APPROVAL_EXERCISE_EVIDENCE_MISMATCH:${point.code}`);
    }
    if (
      !grammarValidation ||
      grammarValidation.runId !== runId ||
      !grammarValidation.passed ||
      grammarValidation.artifactHash !== point.grammarHash
    ) {
      throw new Error(`CF4_APPROVAL_GRAMMAR_VALIDATION_MISMATCH:${point.code}`);
    }
    if (
      !reviewRun ||
      reviewRun.runId !== runId ||
      reviewRun.jobId !== point.reviewJobId ||
      reviewRun.decision !== 'PASS' ||
      reviewRun.artifactHash !== point.grammarHash ||
      reviewRun.reportHash !== point.reviewReportHash
    ) {
      throw new Error(`CF4_APPROVAL_REVIEW_EVIDENCE_MISMATCH:${point.code}`);
    }
    const reviewValidation = validateContentReviewReport(reviewRun.reportJson);
    if (
      !reviewValidation.valid ||
      reviewRun.promptVersion !== reviewValidation.value.reviewer.promptVersion ||
      reviewRun.reviewerProvider !== reviewValidation.value.reviewer.provider ||
      reviewRun.reviewerModel !== reviewValidation.value.reviewer.model ||
      !isContentReviewReady(
        reviewValidation.value,
        getContentReviewPolicy('CF4', expectedReviewProfile),
      )
    ) {
      throw new Error(`CF4_APPROVAL_REVIEW_QUALITY_GATE_FAILED:${point.code}`);
    }
    if (
      !exerciseValidation ||
      exerciseValidation.runId !== runId ||
      !exerciseValidation.passed ||
      exerciseValidation.artifactHash !== point.exerciseHash
    ) {
      throw new Error(`CF4_APPROVAL_EXERCISE_VALIDATION_MISMATCH:${point.code}`);
    }
  }

  private computeCf4ScopeHash(report: Cf4BatchReadinessReport): string {
    return computeSha256(
      JSON.stringify({
        schemaVersion: '1.0',
        phase: 'CF4',
        runId: report.runId,
        manifestRunId: report.manifestRunId,
        batchCode: report.batchCode,
        cefr: report.cefr,
        reviewProfile: report.reviewProfile,
        exerciseTargetPerPoint: report.exerciseTargetPerPoint,
        regressionHash: computeSha256(JSON.stringify(report.regression)),
        points: report.points.map((point) => ({
          code: point.code,
          version: point.version,
          grammarHash: point.grammarHash,
          reviewReportHash: point.reviewReportHash,
          exerciseHash: point.exerciseHash,
          exerciseCount: point.exerciseCount,
        })),
      }),
    );
  }
}
