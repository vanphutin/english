import type { Prisma as PrismaTypes, PrismaClient } from '@prisma/client';
import type { ContentReviewReport } from '@english/contracts';
import { computeSha256 } from './idempotency-lease-manager.js';

/** Persists immutable reviewer evidence after artifact identity/hash checks. */
export class ContentReviewRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async record(params: { runId: string; jobId: string; report: ContentReviewReport }) {
    const job = await this.prisma.contentFactoryJob.findUnique({ where: { id: params.jobId } });
    if (!job || job.runId !== params.runId) throw new Error('CONTENT_REVIEW_JOB_NOT_FOUND');
    if (params.report.reviewer.runId !== params.runId) {
      throw new Error('CONTENT_REVIEW_RUN_ID_MISMATCH');
    }
    if (
      params.report.artifactCode !== job.targetCode ||
      params.report.artifactVersion !== job.targetVersion
    ) {
      throw new Error('CONTENT_REVIEW_ARTIFACT_IDENTITY_MISMATCH');
    }

    const expectedArtifactHash =
      job.purpose === 'REVIEW' ? job.inputHash : (job.outputHash ?? job.inputHash);
    if (params.report.artifactHash !== expectedArtifactHash) {
      throw new Error('CONTENT_REVIEW_ARTIFACT_HASH_MISMATCH');
    }

    const reportJson = JSON.stringify(params.report);
    const reportHash = computeSha256(reportJson);

    return this.prisma.contentReviewRun.upsert({
      where: {
        jobId_artifactHash_promptVersion: {
          jobId: params.jobId,
          artifactHash: params.report.artifactHash,
          promptVersion: params.report.reviewer.promptVersion,
        },
      },
      create: {
        runId: params.runId,
        jobId: params.jobId,
        artifactHash: params.report.artifactHash,
        reviewerProvider: params.report.reviewer.provider,
        reviewerModel: params.report.reviewer.model,
        promptVersion: params.report.reviewer.promptVersion,
        decision: params.report.decision,
        qualityScore: params.report.scores.total,
        reportJson: params.report as unknown as PrismaTypes.InputJsonValue,
        reportHash,
      },
      update: {},
    });
  }
}
