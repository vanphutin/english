import type { Prisma as PrismaTypes, PrismaClient } from '@prisma/client';
import { computeSha256 } from './idempotency-lease-manager.js';

/** Persists deterministic/preflight validation evidence against the exact input artifact. */
export class ContentValidationRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async record(params: {
    runId: string;
    jobId: string;
    artifactHash: string;
    validatorVersion: string;
    passed: boolean;
    report: unknown;
  }) {
    const job = await this.prisma.contentFactoryJob.findUnique({ where: { id: params.jobId } });
    if (!job || job.runId !== params.runId) throw new Error('CONTENT_VALIDATION_JOB_NOT_FOUND');

    const expectedArtifactHash =
      job.purpose === 'VALIDATE' ? job.inputHash : (job.outputHash ?? job.inputHash);
    if (params.artifactHash !== expectedArtifactHash) {
      throw new Error('CONTENT_VALIDATION_ARTIFACT_HASH_MISMATCH');
    }

    const reportJson = JSON.stringify(params.report);
    const reportHash = computeSha256(reportJson);
    return this.prisma.contentValidationRun.upsert({
      where: {
        jobId_artifactHash_validatorVersion: {
          jobId: params.jobId,
          artifactHash: params.artifactHash,
          validatorVersion: params.validatorVersion,
        },
      },
      create: {
        runId: params.runId,
        jobId: params.jobId,
        artifactHash: params.artifactHash,
        validatorVersion: params.validatorVersion,
        passed: params.passed,
        reportJson: params.report as PrismaTypes.InputJsonValue,
        reportHash,
      },
      update: {},
    });
  }
}
