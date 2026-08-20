import type { PrismaClient } from '@prisma/client';
import { ContentFactoryValidator } from '@english/contracts';
import { canTransitionState } from './job-state-machine.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import {
  CF3_GRAMMAR_AUTHOR_PROMPT_VERSION,
  type LessonGenerator,
  type PilotGrammarTarget,
} from './lesson-generator.js';
import {
  CF3_EXERCISE_AUTHOR_PROMPT_VERSION,
  type ExerciseFactory,
  type ExercisePreflightEvidence,
} from './exercise-factory.js';
import type { IndependentContentReviewer } from './independent-reviewer.js';
import type { ContentReviewRunRepository } from './review-run-repository.js';
import type { ContentValidationRunRepository } from './validation-run-repository.js';
import type { Cf3ManifestApprovalGate } from './cf3-manifest-approval-gate.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';

const GRAMMAR_VALIDATOR_VERSION = 'CF3-GRAMMAR-v1';
const EXERCISE_VALIDATOR_VERSION = 'CF3-EXERCISE-v1';
const REVIEW_PROMPT_VERSION = 'cf3-independent-review-v1';

export type Cf3PointStatus = 'READY_FOR_APPROVAL' | 'CHANGES_REQUESTED' | 'QUARANTINED';

export interface Cf3PilotPointResult {
  code: string;
  version: number;
  status: Cf3PointStatus;
  grammarJobId: string | null;
  grammarHash: string | null;
  grammarValidationRunId: string | null;
  reviewJobId: string | null;
  reviewRunId: string | null;
  reviewReportHash: string | null;
  exerciseJobId: string | null;
  exerciseHash: string | null;
  exerciseValidationRunId: string | null;
  exerciseCount: number;
  errorCode: string | null;
}

export interface Cf3PilotReadinessReport {
  schemaVersion: '1.0';
  phase: 'CF3';
  runId: string;
  manifestRunId: string;
  status: 'READY_FOR_APPROVAL' | 'DRAFT_ONLY';
  targetCount: number;
  readyCount: number;
  points: Cf3PilotPointResult[];
  generatedAt: string;
}

interface ActiveJob {
  id: string;
  workerId: string;
}

/**
 * End-to-end CF3 pilot coordinator. It is intentionally limited to 3–5 A1
 * manifest items and has no publication or owner-approval capability.
 */
export class Cf3PilotService {
  private readonly validator = new ContentFactoryValidator();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: ContentFactoryOrchestratorService,
    private readonly manifestGate: Cf3ManifestApprovalGate,
    private readonly grammarAuthor: LessonGenerator,
    private readonly reviewer: IndependentContentReviewer,
    private readonly exerciseFactory: ExerciseFactory,
    private readonly validationRuns: ContentValidationRunRepository,
    private readonly reviewRuns: ContentReviewRunRepository,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async runPilot(params: {
    runId: string;
    manifestRunId: string;
    targets: PilotGrammarTarget[];
    targetVersion?: number;
    exerciseCount?: number;
    workerPrefix?: string;
  }): Promise<Cf3PilotReadinessReport> {
    this.assertPilotScope(params.targets);
    const exerciseCount = params.exerciseCount ?? 12;
    if (exerciseCount < 12 || exerciseCount > 30) {
      throw new Error('EXERCISE_COUNT_MUST_BE_12_TO_30');
    }

    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF3_RUN_NOT_FOUND');
    await this.manifestGate.assertApprovedTargets({
      manifestRunId: params.manifestRunId,
      targets: params.targets,
    });

    const targetVersion = params.targetVersion ?? 1;
    const workerPrefix = params.workerPrefix ?? 'cf3-pilot';
    const points: Cf3PilotPointResult[] = [];

    for (const target of params.targets) {
      points.push(
        await this.runPoint({
          runId: params.runId,
          target,
          pilotTargets: params.targets,
          targetVersion,
          exerciseCount,
          workerPrefix,
        }),
      );
    }

    const readyCount = points.filter((point) => point.status === 'READY_FOR_APPROVAL').length;
    const status = readyCount === params.targets.length ? 'READY_FOR_APPROVAL' : 'DRAFT_ONLY';
    const report: Cf3PilotReadinessReport = {
      schemaVersion: '1.0',
      phase: 'CF3',
      runId: params.runId,
      manifestRunId: params.manifestRunId,
      status,
      targetCount: params.targets.length,
      readyCount,
      points,
      generatedAt: new Date().toISOString(),
    };
    await this.persistReadinessReport(report);
    await this.prisma.contentFactoryRun.update({
      where: { id: params.runId },
      data: { status: status === 'READY_FOR_APPROVAL' ? 'READY FOR OWNER APPROVAL' : 'DRAFT ONLY' },
    });
    return report;
  }

  private async runPoint(params: {
    runId: string;
    target: PilotGrammarTarget;
    pilotTargets: PilotGrammarTarget[];
    targetVersion: number;
    exerciseCount: number;
    workerPrefix: string;
  }): Promise<Cf3PilotPointResult> {
    const result: Cf3PilotPointResult = {
      code: params.target.code,
      version: params.targetVersion,
      status: 'QUARANTINED',
      grammarJobId: null,
      grammarHash: null,
      grammarValidationRunId: null,
      reviewJobId: null,
      reviewRunId: null,
      reviewReportHash: null,
      exerciseJobId: null,
      exerciseHash: null,
      exerciseValidationRunId: null,
      exerciseCount: 0,
      errorCode: null,
    };
    const activeJobs: ActiveJob[] = [];

    try {
      const grammarInput = JSON.stringify({
        phase: 'CF3',
        pilotCodes: params.pilotTargets.map((target) => target.code),
        manifestItem: params.target,
      });
      const grammarJob = await this.orchestrator.enqueueJob({
        runId: params.runId,
        purpose: 'AUTHOR_GRAMMAR',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarInput,
        policyVersions: {
          factory: 'content-factory-v1',
          schema: '1.0',
          prompt: CF3_GRAMMAR_AUTHOR_PROMPT_VERSION,
        },
      });
      result.grammarJobId = grammarJob.job.id;
      const grammarWorker = `${params.workerPrefix}:grammar:${params.target.code}`;
      await this.requireClaim(grammarJob.job.id, grammarWorker);
      activeJobs.push({ id: grammarJob.job.id, workerId: grammarWorker });
      await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'GENERATING');

      const grammar = await this.grammarAuthor.authorPointWithinPilot(
        params.target,
        params.pilotTargets,
        params.targetVersion,
      );
      const grammarJson = JSON.stringify(grammar);
      result.grammarHash = computeSha256(grammarJson);
      await this.orchestrator.advanceJobState(
        grammarJob.job.id,
        grammarWorker,
        'GENERATED',
        grammarJson,
      );
      await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'VALIDATING');

      const grammarValidation = this.validator.validateGrammarPointArtifact(
        grammar,
        `${params.target.code}.v${params.targetVersion}.json`,
      );
      const grammarValidationEvidence = await this.runValidationJob({
        runId: params.runId,
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarJson,
        promptVersion: GRAMMAR_VALIDATOR_VERSION,
        validatorVersion: GRAMMAR_VALIDATOR_VERSION,
        report: grammarValidation,
        passed: grammarValidation.valid,
        workerId: `${params.workerPrefix}:validate-grammar:${params.target.code}`,
      });
      result.grammarValidationRunId = grammarValidationEvidence.validationRunId;
      if (!grammarValidation.valid) {
        await this.orchestrator.advanceJobState(
          grammarJob.job.id,
          grammarWorker,
          'QUARANTINED',
          undefined,
          grammarValidation.findings[0]?.code ?? 'CF3_GRAMMAR_VALIDATION_FAILED',
        );
        result.errorCode = grammarValidation.findings[0]?.code ?? 'CF3_GRAMMAR_VALIDATION_FAILED';
        return result;
      }

      await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'IN_REVIEW');
      const reviewJob = await this.orchestrator.enqueueJob({
        runId: params.runId,
        purpose: 'REVIEW',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarJson,
        policyVersions: {
          factory: 'content-factory-v1',
          schema: '1.0',
          prompt: REVIEW_PROMPT_VERSION,
        },
      });
      result.reviewJobId = reviewJob.job.id;
      const reviewWorker = `${params.workerPrefix}:review:${params.target.code}`;
      await this.requireClaim(reviewJob.job.id, reviewWorker);
      activeJobs.push({ id: reviewJob.job.id, workerId: reviewWorker });
      await this.orchestrator.advanceJobState(reviewJob.job.id, reviewWorker, 'GENERATING');

      const review = await this.reviewer.reviewGrammarPoint({
        runId: params.runId,
        artifact: grammar,
        authorProvider: grammar.provenance.provider,
        authorModel: grammar.provenance.model,
      });
      const reviewRecord = await this.reviewRuns.record({
        runId: params.runId,
        jobId: reviewJob.job.id,
        report: review.report,
      });
      result.reviewRunId = reviewRecord.id;
      result.reviewReportHash = reviewRecord.reportHash;
      const reviewJson = JSON.stringify(review.report);
      await this.orchestrator.advanceJobState(
        reviewJob.job.id,
        reviewWorker,
        'GENERATED',
        reviewJson,
      );
      await this.orchestrator.advanceJobState(reviewJob.job.id, reviewWorker, 'VALIDATING');
      await this.orchestrator.advanceJobState(reviewJob.job.id, reviewWorker, 'IN_REVIEW');

      if (!review.readyForOwnerApproval) {
        await this.orchestrator.advanceJobState(
          reviewJob.job.id,
          reviewWorker,
          'CHANGES_REQUESTED',
          undefined,
          'CF3_REVIEW_CHANGES_REQUESTED',
        );
        await this.orchestrator.advanceJobState(
          grammarJob.job.id,
          grammarWorker,
          'CHANGES_REQUESTED',
          undefined,
          'CF3_REVIEW_CHANGES_REQUESTED',
        );
        result.status = 'CHANGES_REQUESTED';
        result.errorCode = 'CF3_REVIEW_CHANGES_REQUESTED';
        return result;
      }

      await this.orchestrator.advanceJobState(reviewJob.job.id, reviewWorker, 'READY_FOR_APPROVAL');
      await this.orchestrator.advanceJobState(
        grammarJob.job.id,
        grammarWorker,
        'READY_FOR_APPROVAL',
      );

      const exerciseJob = await this.orchestrator.enqueueJob({
        runId: params.runId,
        purpose: 'AUTHOR_EXERCISES',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarJson,
        policyVersions: {
          factory: 'content-factory-v1',
          schema: '1.0',
          prompt: CF3_EXERCISE_AUTHOR_PROMPT_VERSION,
        },
      });
      result.exerciseJobId = exerciseJob.job.id;
      const exerciseWorker = `${params.workerPrefix}:exercise:${params.target.code}`;
      await this.requireClaim(exerciseJob.job.id, exerciseWorker);
      activeJobs.push({ id: exerciseJob.job.id, workerId: exerciseWorker });
      await this.orchestrator.advanceJobState(exerciseJob.job.id, exerciseWorker, 'GENERATING');

      const exercises = await this.exerciseFactory.generateMinimumBankWithEvidence({
        grammarPoint: grammar,
        count: params.exerciseCount,
        seed: `${params.runId}:${params.target.code}:v${params.targetVersion}`,
      });
      const exerciseJson = JSON.stringify(exercises.batch);
      result.exerciseHash = computeSha256(exerciseJson);
      result.exerciseCount = exercises.batch.exercises.length;
      await this.orchestrator.advanceJobState(
        exerciseJob.job.id,
        exerciseWorker,
        'GENERATED',
        exerciseJson,
      );
      await this.orchestrator.advanceJobState(exerciseJob.job.id, exerciseWorker, 'VALIDATING');

      const exerciseValidation = this.validator.validateExerciseBatchArtifact(
        exercises.batch,
        `${params.target.code}.exercise-batch.json`,
      );
      const exerciseReport = {
        deterministic: exerciseValidation,
        preflight: exercises.preflightEvidence,
      };
      const exercisePassed =
        exerciseValidation.valid && this.allPreflightEvidencePassed(exercises.preflightEvidence);
      const exerciseValidationEvidence = await this.runValidationJob({
        runId: params.runId,
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: exerciseJson,
        promptVersion: EXERCISE_VALIDATOR_VERSION,
        validatorVersion: EXERCISE_VALIDATOR_VERSION,
        report: exerciseReport,
        passed: exercisePassed,
        workerId: `${params.workerPrefix}:validate-exercise:${params.target.code}`,
      });
      result.exerciseValidationRunId = exerciseValidationEvidence.validationRunId;

      if (!exercisePassed) {
        await this.orchestrator.advanceJobState(
          exerciseJob.job.id,
          exerciseWorker,
          'QUARANTINED',
          undefined,
          'CF3_EXERCISE_VALIDATION_FAILED',
        );
        result.errorCode = 'CF3_EXERCISE_VALIDATION_FAILED';
        return result;
      }

      await this.orchestrator.advanceJobState(
        exerciseJob.job.id,
        exerciseWorker,
        'READY_FOR_APPROVAL',
      );
      result.status = 'READY_FOR_APPROVAL';
      return result;
    } catch (error: unknown) {
      const errorCode = this.normalizeErrorCode(error);
      result.errorCode = errorCode;
      await this.quarantineActiveJobs(activeJobs, errorCode);
      return result;
    }
  }

  private async runValidationJob(params: {
    runId: string;
    targetCode: string;
    targetVersion: number;
    inputContent: string;
    promptVersion: string;
    validatorVersion: string;
    report: unknown;
    passed: boolean;
    workerId: string;
  }): Promise<{ validationRunId: string }> {
    const job = await this.orchestrator.enqueueJob({
      runId: params.runId,
      purpose: 'VALIDATE',
      targetCode: params.targetCode,
      targetVersion: params.targetVersion,
      inputContent: params.inputContent,
      policyVersions: {
        factory: 'content-factory-v1',
        schema: '1.0',
        prompt: params.promptVersion,
      },
    });
    await this.requireClaim(job.job.id, params.workerId);
    await this.orchestrator.advanceJobState(job.job.id, params.workerId, 'VALIDATING');
    const validationRun = await this.validationRuns.record({
      runId: params.runId,
      jobId: job.job.id,
      artifactHash: job.job.inputHash,
      validatorVersion: params.validatorVersion,
      passed: params.passed,
      report: params.report,
    });
    await this.orchestrator.advanceJobState(
      job.job.id,
      params.workerId,
      params.passed ? 'READY_FOR_APPROVAL' : 'QUARANTINED',
      JSON.stringify(params.report),
      params.passed ? undefined : `${params.validatorVersion}_FAILED`,
    );
    return { validationRunId: validationRun.id };
  }

  private async requireClaim(jobId: string, workerId: string): Promise<void> {
    const claimed = await this.orchestrator.claimJob(jobId, workerId, 30);
    if (!claimed) throw new Error(`CF3_JOB_COULD_NOT_BE_CLAIMED:${jobId}`);
  }

  private allPreflightEvidencePassed(evidence: ExercisePreflightEvidence[]): boolean {
    return evidence.every(
      (item) =>
        item.result.targetNecessityPassed &&
        item.result.ambiguityPassed &&
        item.result.evaluatorPassed,
    );
  }

  private async quarantineActiveJobs(jobs: ActiveJob[], errorCode: string): Promise<void> {
    for (const job of [...jobs].reverse()) {
      const current = await this.prisma.contentFactoryJob.findUnique({ where: { id: job.id } });
      if (!current || current.workerId !== job.workerId) continue;
      if (!canTransitionState(current.state, 'QUARANTINED')) continue;
      await this.orchestrator
        .advanceJobState(job.id, job.workerId, 'QUARANTINED', undefined, errorCode)
        .catch(() => undefined);
    }
  }

  private normalizeErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : 'CF3_UNKNOWN_ERROR';
    return (message.split(':')[0] || 'CF3_UNKNOWN_ERROR').slice(0, 120);
  }

  private assertPilotScope(targets: PilotGrammarTarget[]): void {
    if (targets.length < 3 || targets.length > 5) {
      throw new Error('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');
    }
    if (new Set(targets.map((target) => target.code)).size !== targets.length) {
      throw new Error('CF3_PILOT_TARGETS_MUST_BE_UNIQUE');
    }
    if (targets.some((target) => target.cefr !== 'A1')) {
      throw new Error('CF3_PILOT_ONLY_ACCEPTS_A1_POINTS');
    }
  }

  private async persistReadinessReport(report: Cf3PilotReadinessReport): Promise<void> {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const hash = computeSha256(content);
    const artifact = this.storage.saveArtifact(
      report.runId,
      `cf3_readiness_${hash.slice(0, 12)}.json`,
      content,
    );
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId: report.runId,
        artifactType: 'CF3_READINESS_REPORT',
        contentHash: artifact.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId: report.runId,
          artifactPath: artifact.artifactPath,
          artifactType: 'CF3_READINESS_REPORT',
          contentHash: artifact.contentHash,
          storageUri: artifact.storageUri,
          metadataJson: { phase: 'CF3', status: report.status },
        },
      });
    }
  }
}
