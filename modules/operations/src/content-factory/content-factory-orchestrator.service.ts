import {
  Prisma,
  type Prisma as PrismaTypes,
  type ContentFactoryJobPurpose,
  type ContentFactoryJobState,
  type PrismaClient,
} from '@prisma/client';
import {
  ContentFactoryValidator,
  generateDryRunReport,
  type ContentFactoryStatus,
} from '@english/contracts';
import { canTransitionState } from './job-state-machine.js';
import { computeIdempotencyKey, computeSha256 } from './idempotency-lease-manager.js';
import { ManifestPlanner } from './manifest-planner.js';
import { ContentFactoryStorageRepository } from './storage-repository.js';

export interface StartRunParams {
  policyVersion?: string;
  maxRequests?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxEstimatedCost?: number;
}

export interface EnqueueJobParams {
  runId: string;
  purpose: ContentFactoryJobPurpose;
  targetCode: string;
  targetVersion?: number;
  inputContent: string;
  policyVersions?: {
    factory: 'content-factory-v1';
    schema: string;
    prompt: string;
  };
  budget?: {
    maxRequests: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxEstimatedCost: number;
  };
}

const LEASE_RELEASE_STATES = new Set<ContentFactoryJobState>([
  'READY_FOR_APPROVAL',
  'APPROVED',
  'CHANGES_REQUESTED',
  'RETRY_WAIT',
  'QUARANTINED',
  'REJECTED',
  'CANCELLED',
  'SUCCEEDED',
]);

export class ContentFactoryOrchestratorService {
  private validator: ContentFactoryValidator;
  private storageRepo: ContentFactoryStorageRepository;

  constructor(
    private prisma: PrismaClient,
    storageDir?: string,
  ) {
    this.validator = new ContentFactoryValidator();
    this.storageRepo = new ContentFactoryStorageRepository(storageDir);
  }

  public async startRun(params?: StartRunParams) {
    const run = await this.prisma.contentFactoryRun.create({
      data: {
        policyVersion: params?.policyVersion ?? 'content-factory-v1',
        status: 'DRAFT ONLY',
        maxRequests: params?.maxRequests ?? 100,
        maxInputTokens: params?.maxInputTokens ?? 500000,
        maxOutputTokens: params?.maxOutputTokens ?? 200000,
        maxEstimatedCost: params?.maxEstimatedCost ?? 10.0,
      },
    });

    return run;
  }

  /**
   * Enqueues idempotently even when identical deliveries race. The database
   * unique key is the final arbiter; a losing concurrent writer returns the
   * already-created job instead of surfacing a duplicate-key failure.
   */
  public async enqueueJob(params: EnqueueJobParams) {
    const run = await this.prisma.contentFactoryRun.findUnique({
      where: { id: params.runId },
    });
    if (!run) {
      throw new Error(`ContentFactoryRun with ID ${params.runId} not found`);
    }

    const inputHash = computeSha256(params.inputContent);
    const targetVersion = params.targetVersion ?? 1;
    const attempt = 1;
    const policyVersions = params.policyVersions ?? {
      factory: 'content-factory-v1' as const,
      schema: '1.0',
      prompt: 'v1.0.0',
    };

    const idempotencyKey = computeIdempotencyKey({
      purpose: params.purpose,
      inputHash,
      targetCode: params.targetCode,
      targetVersion,
      policyVersion: policyVersions.factory,
      schemaVersion: policyVersions.schema,
      promptVersion: policyVersions.prompt,
      attempt,
    });

    const existingJob = await this.prisma.contentFactoryJob.findUnique({
      where: { idempotencyKey },
    });

    if (existingJob) {
      return { job: existingJob, isDuplicate: true };
    }

    const inputFilename = [
      'job',
      params.purpose.toLowerCase(),
      params.targetCode,
      `v${targetVersion}`,
      `att${attempt}`,
      inputHash.slice(0, 12),
      'input.json',
    ].join('_');
    const inputRef = this.storageRepo.saveArtifact(
      params.runId,
      inputFilename,
      params.inputContent,
    );

    const defaultBudget = params.budget ?? {
      maxRequests: 5,
      maxInputTokens: 20000,
      maxOutputTokens: 10000,
      maxEstimatedCost: 0.5,
    };

    try {
      const newJob = await this.prisma.contentFactoryJob.create({
        data: {
          runId: params.runId,
          purpose: params.purpose,
          targetCode: params.targetCode,
          targetVersion,
          state: 'QUEUED',
          attempt,
          idempotencyKey,
          inputHash,
          policyVersionsJson: policyVersions,
          budgetJson: defaultBudget,
          artifacts: {
            create: {
              runId: params.runId,
              artifactPath: inputRef.artifactPath,
              artifactType: 'INPUT_SNAPSHOT',
              contentHash: inputRef.contentHash,
              storageUri: inputRef.storageUri,
            },
          },
        },
        include: { artifacts: true },
      });

      return { job: newJob, isDuplicate: false };
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === 'P2002') {
        const concurrentJob = await this.prisma.contentFactoryJob.findUnique({
          where: { idempotencyKey },
        });
        if (concurrentJob) return { job: concurrentJob, isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Claims exactly one queued or expired active job. Expired work is reset to
   * CLAIMED so the new worker must deliberately resume the state machine rather
   * than inheriting another worker's in-flight phase.
   */
  public async claimNextJob(workerId: string, runId?: string, leaseMinutes = 5) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60 * 1000);

    const runFilter = runId ? Prisma.sql`AND "run_id" = ${runId}::uuid` : Prisma.empty;
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "content_factory_jobs"
      SET "state" = 'CLAIMED',
          "worker_id" = ${workerId},
          "lease_expires_at" = ${leaseExpiresAt},
          "updated_at" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "content_factory_jobs"
        WHERE (
          "state" = 'QUEUED'
          OR (
            "lease_expires_at" <= ${now}
            AND "state" IN ('CLAIMED', 'GENERATING', 'GENERATED', 'VALIDATING', 'IN_REVIEW', 'PUBLISHING', 'FAILED')
          )
        )
        ${runFilter}
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id"
    `);
    if (!claimed[0]) return null;
    return this.prisma.contentFactoryJob.findUnique({ where: { id: claimed[0].id } });
  }

  /** Claims a specific job atomically; orchestration must never claim one row and operate on another. */
  public async claimJob(jobId: string, workerId: string, leaseMinutes = 5) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60 * 1000);
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "content_factory_jobs"
      SET "state" = 'CLAIMED',
          "worker_id" = ${workerId},
          "lease_expires_at" = ${leaseExpiresAt},
          "updated_at" = ${now}
      WHERE "id" = ${jobId}::uuid
        AND (
          "state" = 'QUEUED'
          OR (
            "lease_expires_at" <= ${now}
            AND "state" IN ('CLAIMED', 'GENERATING', 'GENERATED', 'VALIDATING', 'IN_REVIEW', 'PUBLISHING', 'FAILED')
          )
        )
      RETURNING "id"
    `);
    if (!claimed[0]) return null;
    return this.prisma.contentFactoryJob.findUnique({ where: { id: claimed[0].id } });
  }

  /**
   * Advances state only when the caller still owns an unexpired lease and the
   * database row is still in the state that was validated. Output bytes are
   * persisted only after that conditional update succeeds, so an expired or
   * reclaimed worker cannot leave an authoritative output artifact behind.
   */
  public async advanceJobState(
    jobId: string,
    workerId: string,
    targetState: ContentFactoryJobState,
    outputContent?: string,
    normalizedErrorCode?: string,
  ) {
    const job = await this.prisma.contentFactoryJob.findUnique({
      where: { id: jobId },
      include: { run: true },
    });

    if (!job) throw new Error(`Job ${jobId} not found`);

    if (!canTransitionState(job.state, targetState)) {
      throw new Error(`Invalid state transition from ${job.state} to ${targetState}`);
    }

    const outputHash = outputContent ? computeSha256(outputContent) : undefined;
    const releaseLease = LEASE_RELEASE_STATES.has(targetState);
    const now = new Date();
    const outputFilename = outputHash
      ? [
          'job',
          job.purpose.toLowerCase(),
          job.targetCode,
          `v${job.targetVersion}`,
          `att${job.attempt}`,
          targetState.toLowerCase(),
          outputHash.slice(0, 12),
          'output.json',
        ].join('_')
      : undefined;
    let createdOutputFile = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const affected = await tx.$executeRaw`
          UPDATE "content_factory_jobs"
          SET "state" = ${targetState}::"ContentFactoryJobState",
              "output_hash" = COALESCE(${outputHash ?? null}, "output_hash"),
              "normalized_error_code" = COALESCE(${normalizedErrorCode ?? null}, "normalized_error_code"),
              "worker_id" = CASE WHEN ${releaseLease} THEN NULL ELSE "worker_id" END,
              "lease_expires_at" = CASE WHEN ${releaseLease} THEN NULL ELSE "lease_expires_at" END,
              "updated_at" = ${now}
          WHERE "id" = ${jobId}::uuid
            AND "state" = ${job.state}::"ContentFactoryJobState"
            AND "worker_id" = ${workerId}
            AND "lease_expires_at" > ${now}
        `;

        if (affected === 0) {
          throw new Error(
            `Worker ${workerId} does not hold an active lease for job ${jobId} ` +
              `(lease may have expired, state changed, or job was reclaimed)`,
          );
        }

        if (outputContent && outputFilename) {
          const outputRef = this.storageRepo.saveArtifact(
            job.runId,
            outputFilename,
            outputContent,
          );
          createdOutputFile = outputRef.created;
          await tx.contentFactoryArtifact.create({
            data: {
              runId: job.runId,
              jobId: job.id,
              artifactPath: outputRef.artifactPath,
              artifactType: 'OUTPUT_SNAPSHOT',
              contentHash: outputRef.contentHash,
              storageUri: outputRef.storageUri,
            },
          });
        }
      });
    } catch (error: unknown) {
      if (createdOutputFile && outputFilename) {
        this.storageRepo.removeArtifact(job.runId, outputFilename);
      }
      throw error;
    }

    return this.prisma.contentFactoryJob.findUniqueOrThrow({ where: { id: jobId } });
  }

  public async validateManifestJob(jobId: string, workerId: string) {
    const job = await this.prisma.contentFactoryJob.findUnique({
      where: { id: jobId },
      include: { artifacts: true },
    });

    if (!job) throw new Error(`Job ${jobId} not found`);

    const inputArtifact = job.artifacts.find(
      (artifact: { artifactType: string }) => artifact.artifactType === 'INPUT_SNAPSHOT',
    );
    if (!inputArtifact) throw new Error(`Job ${jobId} has no input snapshot artifact`);

    const inputFilename = inputArtifact.artifactPath.split('/').at(-1);
    if (!inputFilename) throw new Error(`Job ${jobId} has an invalid input artifact path`);
    const inputContent = this.storageRepo.readArtifact(job.runId, inputFilename);
    if (!inputContent) throw new Error(`Could not read input artifact for job ${jobId}`);

    await this.advanceJobState(jobId, workerId, 'VALIDATING');

    const manifestData: unknown = JSON.parse(inputContent);
    const validationResult = this.validator.validateManifestArtifact(
      manifestData,
      inputArtifact.artifactPath,
    );
    const validationJson = JSON.stringify(validationResult);
    const validationHash = computeSha256(validationJson);
    await this.prisma.contentValidationRun.upsert({
      where: {
        jobId_artifactHash_validatorVersion: {
          jobId,
          artifactHash: inputArtifact.contentHash,
          validatorVersion: 'CF0-v2',
        },
      },
      create: {
        runId: job.runId,
        jobId,
        artifactHash: inputArtifact.contentHash,
        validatorVersion: 'CF0-v2',
        passed: validationResult.valid,
        reportJson: validationResult as unknown as PrismaTypes.InputJsonValue,
        reportHash: validationHash,
      },
      update: {},
    });

    const reportStatus: ContentFactoryStatus = validationResult.valid
      ? 'READY FOR OWNER APPROVAL'
      : 'DRAFT ONLY';
    const reportText = generateDryRunReport({
      runId: job.runId,
      phase: 'CF1',
      manifestHash: job.inputHash,
      validationResult,
      status: reportStatus,
    });

    const validationReportHash = computeSha256(reportText);
    this.storageRepo.saveArtifact(
      job.runId,
      `validation_report_${job.targetCode}_${validationReportHash.slice(0, 12)}.md`,
      reportText,
    );

    const nextState: ContentFactoryJobState = validationResult.valid
      ? 'READY_FOR_APPROVAL'
      : 'QUARANTINED';
    const result = await this.advanceJobState(
      jobId,
      workerId,
      nextState,
      validationJson,
      validationResult.valid ? undefined : validationResult.findings[0]?.code,
    );
    if (validationResult.valid) {
      await this.prisma.contentFactoryRun.update({
        where: { id: job.runId },
        data: { status: 'READY FOR OWNER APPROVAL', manifestHash: job.inputHash },
      });
    }
    return result;
  }

  public async getApprovalScopeHash(runId: string): Promise<string> {
    const jobs = await this.prisma.contentFactoryJob.findMany({
      where: { runId },
      orderBy: [{ targetCode: 'asc' }, { targetVersion: 'asc' }],
    });
    if (!jobs.length || jobs.some((job) => job.state !== 'READY_FOR_APPROVAL')) {
      throw new Error('RUN_NOT_READY_FOR_OWNER_APPROVAL');
    }
    return computeSha256(
      JSON.stringify(
        jobs.map((job) => ({
          code: job.targetCode,
          version: job.targetVersion,
          hash: job.outputHash ?? job.inputHash,
        })),
      ),
    );
  }

  /**
   * Human-only boundary. Automated agents may prepare scopeHash/rationale but
   * must not synthesize approvedBy or the exact APPROVE:<hash> confirmation.
   */
  public async recordOwnerApproval(params: {
    runId: string;
    approvedBy: string;
    rationale: string;
    expectedScopeHash: string;
    confirmation: string;
  }) {
    const { runId, approvedBy, rationale, expectedScopeHash, confirmation } = params;
    const run = await this.prisma.contentFactoryRun.findUnique({
      where: { id: runId },
      include: { jobs: true },
    });

    if (!run) throw new Error(`Run ${runId} not found`);

    const scopeHash = await this.getApprovalScopeHash(runId);
    if (scopeHash !== expectedScopeHash || confirmation !== `APPROVE:${scopeHash}`) {
      throw new Error('OWNER_APPROVAL_HASH_MISMATCH');
    }
    const approvalHash = computeSha256(`${runId}:${approvedBy}:${scopeHash}:${rationale}`);
    const requestHash = computeSha256(
      JSON.stringify({ runId, approvedBy, rationale, expectedScopeHash, confirmation }),
    );

    const approval = await this.prisma.contentFactoryApproval.create({
      data: {
        runId,
        approvedBy,
        scopeHash,
        approvalHash,
        rationale,
        requestHash,
        decisionSource: 'OWNER_CLI',
      },
    });

    await this.prisma.contentFactoryRun.update({
      where: { id: runId },
      data: { status: 'OWNER APPROVED', manifestHash: scopeHash },
    });

    return approval;
  }

  public async planManifest(runId: string, workerId = 'worker-manifest-planner') {
    const planner = new ManifestPlanner();
    const plannerResult = planner.generateFullAutonomousManifest();

    const manifestContent = JSON.stringify(plannerResult.manifest, null, 2);
    const manifestHash = computeSha256(manifestContent);
    const manifestRef = this.storageRepo.saveArtifact(
      runId,
      `autonomous_manifest_draft_${manifestHash.slice(0, 12)}.json`,
      manifestContent,
    );

    const enqueueRes = await this.enqueueJob({
      runId,
      purpose: 'PLAN_MANIFEST',
      targetCode: plannerResult.manifest.manifestCode,
      inputContent: manifestContent,
    });

    const claimed = await this.claimJob(enqueueRes.job.id, workerId);
    if (!claimed) throw new Error('MANIFEST_JOB_COULD_NOT_BE_CLAIMED');
    const validationJob = await this.validateManifestJob(enqueueRes.job.id, workerId);

    return {
      runId,
      plannerResult,
      validationJob,
      manifestRef,
    };
  }

  // Bulk generation and publication are intentionally absent from this service.
  // CF3 must use the provider-backed pilot path and remain bounded to 3–5 A1 points.
}
