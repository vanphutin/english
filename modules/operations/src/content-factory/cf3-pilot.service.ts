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
const FACTORY_POLICY_VERSION = 'content-factory-v1';
const SCHEMA_VERSION = '1.0';

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

interface OutputArtifactOwner {
  runId: string;
  outputHash: string | null;
  artifacts: Array<{
    artifactPath: string;
    artifactType: string;
    contentHash: string;
  }>;
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
    const resumedPoints = await Promise.all(
      params.targets.map((target) =>
        this.tryLoadCompletedPoint({
          runId: params.runId,
          target,
          pilotTargets: params.targets,
          targetVersion,
          exerciseCount,
        }),
      ),
    );
    const completedPoints = resumedPoints.filter(
      (point): point is Cf3PilotPointResult => point !== null,
    );

    if (completedPoints.length === params.targets.length) {
      const readinessArtifact = await this.prisma.contentFactoryArtifact.findFirst({
        where: { runId: params.runId, artifactType: 'CF3_READINESS_REPORT' },
        orderBy: { createdAt: 'desc' },
      });
      return {
        schemaVersion: '1.0',
        phase: 'CF3',
        runId: params.runId,
        manifestRunId: params.manifestRunId,
        status: 'READY_FOR_APPROVAL',
        targetCount: params.targets.length,
        readyCount: completedPoints.length,
        points: completedPoints,
        generatedAt: (readinessArtifact?.createdAt ?? run.updatedAt).toISOString(),
      };
    }

    const points: Cf3PilotPointResult[] = [];
    for (const [index, target] of params.targets.entries()) {
      const resumedPoint = resumedPoints[index];
      points.push(
        resumedPoint ??
          (await this.runPoint({
            runId: params.runId,
            target,
            pilotTargets: params.targets,
            targetVersion,
            exerciseCount,
            workerPrefix,
          })),
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
      const grammarInput = this.buildGrammarInput(params.target, params.pilotTargets);
      const grammarJob = await this.orchestrator.enqueueJob({
        runId: params.runId,
        purpose: 'AUTHOR_GRAMMAR',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarInput,
        policyVersions: {
          factory: FACTORY_POLICY_VERSION,
          schema: SCHEMA_VERSION,
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
          factory: FACTORY_POLICY_VERSION,
          schema: SCHEMA_VERSION,
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

      const exerciseSeed = `${params.runId}:${params.target.code}:v${params.targetVersion}`;
      const exerciseInput = this.buildExerciseJobInput(
        grammarJson,
        params.exerciseCount,
        exerciseSeed,
      );
      const exerciseJob = await this.orchestrator.enqueueJob({
        runId: params.runId,
        purpose: 'AUTHOR_EXERCISES',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: exerciseInput,
        policyVersions: {
          factory: FACTORY_POLICY_VERSION,
          schema: SCHEMA_VERSION,
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
        seed: exerciseSeed,
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

  private async tryLoadCompletedPoint(params: {
    runId: string;
    target: PilotGrammarTarget;
    pilotTargets: PilotGrammarTarget[];
    targetVersion: number;
    exerciseCount: number;
  }): Promise<Cf3PilotPointResult | null> {
    const grammarInputHash = computeSha256(
      this.buildGrammarInput(params.target, params.pilotTargets),
    );
    const jobs = await this.prisma.contentFactoryJob.findMany({
      where: {
        runId: params.runId,
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
      },
      include: { artifacts: true, validations: true, reviews: true },
    });
    const grammarJob = jobs.find(
      (job) =>
        job.purpose === 'AUTHOR_GRAMMAR' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === grammarInputHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, CF3_GRAMMAR_AUTHOR_PROMPT_VERSION),
    );
    if (!grammarJob?.outputHash) return null;

    const grammarJson = this.readVerifiedOutput(grammarJob);
    if (!grammarJson) return null;
    const grammarHash = computeSha256(grammarJson);
    if (grammarHash !== grammarJob.outputHash) return null;

    const reviewJob = jobs.find(
      (job) =>
        job.purpose === 'REVIEW' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === grammarHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, REVIEW_PROMPT_VERSION),
    );
    if (!reviewJob) return null;

    const grammarValidationJob = jobs.find(
      (job) =>
        job.purpose === 'VALIDATE' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === grammarHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, GRAMMAR_VALIDATOR_VERSION),
    );
    const grammarValidationRun = grammarValidationJob?.validations.find(
      (validation) =>
        validation.artifactHash === grammarHash &&
        validation.validatorVersion === GRAMMAR_VALIDATOR_VERSION &&
        validation.passed,
    );
    if (!grammarValidationJob || !grammarValidationRun) return null;

    const reviewRun = reviewJob.reviews.find(
      (review) =>
        review.artifactHash === grammarHash &&
        review.promptVersion === REVIEW_PROMPT_VERSION &&
        review.decision === 'PASS',
    );
    if (!reviewRun) return null;

    const exerciseSeed = `${params.runId}:${params.target.code}:v${params.targetVersion}`;
    const exerciseInputHash = computeSha256(
      this.buildExerciseJobInput(grammarJson, params.exerciseCount, exerciseSeed),
    );
    const exerciseJob = jobs.find(
      (job) =>
        job.purpose === 'AUTHOR_EXERCISES' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === exerciseInputHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, CF3_EXERCISE_AUTHOR_PROMPT_VERSION),
    );
    if (!exerciseJob?.outputHash) return null;

    const exerciseJson = this.readVerifiedOutput(exerciseJob);
    if (!exerciseJson) return null;
    const exerciseHash = computeSha256(exerciseJson);
    if (exerciseHash !== exerciseJob.outputHash) return null;
    const exerciseCount = this.readExerciseCount(exerciseJson);
    if (exerciseCount !== params.exerciseCount) return null;

    const exerciseValidationJob = jobs.find(
      (job) =>
        job.purpose === 'VALIDATE' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === exerciseHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, EXERCISE_VALIDATOR_VERSION),
    );
    const exerciseValidationRun = exerciseValidationJob?.validations.find(
      (validation) =>
        validation.artifactHash === exerciseHash &&
        validation.validatorVersion === EXERCISE_VALIDATOR_VERSION &&
        validation.passed,
    );
    if (!exerciseValidationJob || !exerciseValidationRun) return null;

    return {
      code: params.target.code,
      version: params.targetVersion,
      status: 'READY_FOR_APPROVAL',
      grammarJobId: grammarJob.id,
      grammarHash,
      grammarValidationRunId: grammarValidationRun.id,
      reviewJobId: reviewJob.id,
      reviewRunId: reviewRun.id,
      reviewReportHash: reviewRun.reportHash,
      exerciseJobId: exerciseJob.id,
      exerciseHash,
      exerciseValidationRunId: exerciseValidationRun.id,
      exerciseCount,
      errorCode: null,
    };
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
        factory: FACTORY_POLICY_VERSION,
        schema: SCHEMA_VERSION,
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

  private buildGrammarInput(
    target: PilotGrammarTarget,
    pilotTargets: PilotGrammarTarget[],
  ): string {
    return JSON.stringify({
      phase: 'CF3',
      pilotCodes: pilotTargets.map((item) => item.code).sort(),
      manifestItem: target,
    });
  }

  private buildExerciseJobInput(grammarJson: string, exerciseCount: number, seed: string): string {
    const grammarPoint: unknown = JSON.parse(grammarJson);
    return JSON.stringify({ grammarPoint, exerciseCount, seed });
  }

  private hasPinnedPolicy(value: unknown, promptVersion: string): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const policy = value as Record<string, unknown>;
    return (
      policy.factory === FACTORY_POLICY_VERSION &&
      policy.schema === SCHEMA_VERSION &&
      policy.prompt === promptVersion
    );
  }

  private readVerifiedOutput(job: OutputArtifactOwner): string | null {
    if (!job.outputHash) return null;
    const artifact = job.artifacts.find(
      (item) => item.artifactType === 'OUTPUT_SNAPSHOT' && item.contentHash === job.outputHash,
    );
    const filename = artifact?.artifactPath.split('/').at(-1);
    if (!filename) return null;
    const content = this.storage.readArtifact(job.runId, filename);
    if (!content || computeSha256(content) !== job.outputHash) return null;
    return content;
  }

  private readExerciseCount(exerciseJson: string): number {
    try {
      const value: unknown = JSON.parse(exerciseJson);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
      const exercises = (value as Record<string, unknown>).exercises;
      return Array.isArray(exercises) ? exercises.length : 0;
    } catch {
      return 0;
    }
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
