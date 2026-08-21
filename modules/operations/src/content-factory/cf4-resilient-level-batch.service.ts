import type { ContentFactoryJobState, PrismaClient } from '@prisma/client';
import {
  ContentFactoryValidator,
  type ContentReviewReport,
} from '@english/contracts';
import { canTransitionState } from './job-state-machine.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import {
  CF4_GRAMMAR_AUTHOR_PROMPT_VERSION,
  type GrammarPointBundleSpec,
  type GrammarRevisionContext,
  type LessonGenerator,
} from './lesson-generator.js';
import {
  CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
  type ExerciseFactory,
  type ExercisePreflightEvidence,
} from './exercise-factory.js';
import {
  CF4_ADVANCED_REVIEW_PROMPT_VERSION,
  CF4_REVIEW_PROMPT_VERSION,
  getContentReviewPolicy,
  isContentReviewReady,
  type IndependentContentReviewer,
} from './independent-reviewer.js';
import type { ContentReviewRunRepository } from './review-run-repository.js';
import type { ContentValidationRunRepository } from './validation-run-repository.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';
import type { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import type { Cf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import type { Cf4BatchPoint, Cf4LevelBatch, Cf4ReviewProfile } from './cf4-level-batch-planner.js';
import {
  Cf4BatchRegressionValidator,
  type Cf4BatchRegressionReport,
} from './cf4-batch-regression.js';
import {
  Cf4ExecutionControl,
  type Cf4AiBudgetEstimate,
} from './cf4-execution-control.js';

const GRAMMAR_VALIDATOR_VERSION = 'CF4-GRAMMAR-v1';
const EXERCISE_VALIDATOR_VERSION = 'CF4-EXERCISE-v1';
const FACTORY_POLICY_VERSION = 'content-factory-v1';
const SCHEMA_VERSION = '1.0';
const MAX_ATTEMPTS = 3 as const;

export type Cf4ResilientPointStatus =
  | 'READY_FOR_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'QUARANTINED';

export interface Cf4ResilientPointResult {
  code: string;
  version: number;
  status: Cf4ResilientPointStatus;
  reviewProfile: Cf4ReviewProfile | null;
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
  grammarAttempt: number | null;
  exerciseAttempt: number | null;
  resumedFromCheckpoint: boolean;
  errorCode: string | null;
}

export interface Cf4ResilientBatchReadinessReport {
  schemaVersion: '1.0';
  phase: 'CF4';
  executionVersion: 'resilient-v1';
  runId: string;
  manifestRunId: string;
  batchCode: string;
  cefr: Cf4LevelBatch['cefr'];
  reviewProfile: Cf4ReviewProfile;
  exerciseTargetPerPoint: number;
  maxAttempts: 3;
  status: 'READY_FOR_APPROVAL' | 'DRAFT_ONLY';
  targetCount: number;
  readyCount: number;
  resumedPointCount: number;
  regression: Cf4BatchRegressionReport;
  points: Cf4ResilientPointResult[];
  generatedAt: string;
}

export interface Cf4ResilientBudgetPolicy {
  grammar: Cf4AiBudgetEstimate;
  review: Cf4AiBudgetEstimate;
  exerciseOutputTokensPerItem: number;
  exerciseEstimatedCost: number;
}

const DEFAULT_BUDGET_POLICY: Cf4ResilientBudgetPolicy = {
  grammar: { outputTokens: 3500, estimatedCost: 0 },
  review: { outputTokens: 2200, estimatedCost: 0 },
  exerciseOutputTokensPerItem: 350,
  exerciseEstimatedCost: 0,
};

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

interface GrammarCheckpoint {
  grammar: GrammarPointBundleSpec;
  grammarJson: string;
  grammarHash: string;
  grammarJobId: string;
  grammarValidationRunId: string;
  reviewJobId: string;
  reviewRunId: string;
  reviewReportHash: string;
  attempt: number;
  resumed: boolean;
}

interface ExerciseCheckpoint {
  exerciseJobId: string;
  exerciseHash: string;
  exerciseValidationRunId: string;
  exerciseCount: number;
  attempt: number;
  resumed: boolean;
}

interface RetryFailure {
  status: 'CHANGES_REQUESTED' | 'QUARANTINED';
  errorCode: string;
}

/**
 * Resilient CF4 coordinator. Unlike the initial coordinator, it resumes at the
 * grammar+review checkpoint, creates immutable retry/revision attempts 2/3,
 * and reserves run budget atomically before every provider call. It still has
 * no approval or publication capability.
 */
export class Cf4ResilientLevelBatchService {
  private readonly validator = new ContentFactoryValidator();
  private readonly regression = new Cf4BatchRegressionValidator();
  private readonly execution: Cf4ExecutionControl;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: ContentFactoryOrchestratorService,
    private readonly manifestGate: Cf4ManifestApprovalGate,
    private readonly grammarAuthor: LessonGenerator,
    private readonly reviewer: IndependentContentReviewer,
    private readonly exerciseFactory: ExerciseFactory,
    private readonly validationRuns: ContentValidationRunRepository,
    private readonly reviewRuns: ContentReviewRunRepository,
    private readonly storage: ContentFactoryStorageRepository,
  ) {
    this.execution = new Cf4ExecutionControl(prisma, storage);
  }

  public async runBatch(params: {
    runId: string;
    manifestRunId: string;
    batch: Cf4LevelBatch;
    targetVersion?: number;
    workerPrefix?: string;
    budgetPolicy?: Partial<Cf4ResilientBudgetPolicy>;
  }): Promise<Cf4ResilientBatchReadinessReport> {
    this.assertBatchScope(params.batch);
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF4_RUN_NOT_FOUND');
    await this.manifestGate.assertApprovedBatch({
      manifestRunId: params.manifestRunId,
      batch: params.batch,
    });

    const targetVersion = params.targetVersion ?? 1;
    const workerPrefix = params.workerPrefix ?? `cf4-resilient:${params.batch.batchCode}`;
    const budgetPolicy = this.resolveBudgetPolicy(params.budgetPolicy);
    const points: Cf4ResilientPointResult[] = [];

    for (const target of params.batch.points) {
      points.push(
        await this.runPoint({
          runId: params.runId,
          batch: params.batch,
          target,
          targetVersion,
          workerPrefix,
          budgetPolicy,
        }),
      );
    }

    const regression = this.regression.validate(params.batch, points);
    const readyCount = points.filter((point) => point.status === 'READY_FOR_APPROVAL').length;
    const status =
      readyCount === params.batch.points.length && regression.passed
        ? 'READY_FOR_APPROVAL'
        : 'DRAFT_ONLY';
    const report: Cf4ResilientBatchReadinessReport = {
      schemaVersion: '1.0',
      phase: 'CF4',
      executionVersion: 'resilient-v1',
      runId: params.runId,
      manifestRunId: params.manifestRunId,
      batchCode: params.batch.batchCode,
      cefr: params.batch.cefr,
      reviewProfile: params.batch.reviewProfile,
      exerciseTargetPerPoint: params.batch.exerciseTargetPerPoint,
      maxAttempts: MAX_ATTEMPTS,
      status,
      targetCount: params.batch.points.length,
      readyCount,
      resumedPointCount: points.filter((point) => point.resumedFromCheckpoint).length,
      regression,
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
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    workerPrefix: string;
    budgetPolicy: Cf4ResilientBudgetPolicy;
  }): Promise<Cf4ResilientPointResult> {
    const result = this.emptyPointResult(params.target.code, params.targetVersion);

    try {
      let grammar = await this.loadGrammarCheckpoint(params);
      if (!grammar) {
        const authored = await this.authorAndReviewWithRetries(params);
        if ('status' in authored) {
          result.status = authored.status;
          result.errorCode = authored.errorCode;
          return result;
        }
        grammar = authored;
      } else {
        result.resumedFromCheckpoint = true;
      }

      this.applyGrammarCheckpoint(result, grammar);

      let exercises = await this.loadExerciseCheckpoint({ ...params, grammar });
      if (!exercises) {
        const generated = await this.generateExercisesWithRetries({ ...params, grammar });
        if ('status' in generated) {
          result.status = generated.status;
          result.errorCode = generated.errorCode;
          return result;
        }
        exercises = generated;
      } else {
        result.resumedFromCheckpoint = true;
      }

      this.applyExerciseCheckpoint(result, exercises);
      result.status = 'READY_FOR_APPROVAL';
      result.errorCode = null;
      return result;
    } catch (error: unknown) {
      result.errorCode = this.normalizeErrorCode(error);
      result.status = this.isHardStop(result.errorCode) ? 'QUARANTINED' : 'CHANGES_REQUESTED';
      return result;
    }
  }

  private async authorAndReviewWithRetries(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    workerPrefix: string;
    budgetPolicy: Cf4ResilientBudgetPolicy;
  }): Promise<GrammarCheckpoint | RetryFailure> {
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const usedAttempts = jobs
      .filter(
        (job) =>
          job.purpose === 'AUTHOR_GRAMMAR' &&
          this.hasPinnedPolicy(job.policyVersionsJson, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
      )
      .map((job) => job.attempt);
    const firstAttempt = Math.max(0, ...usedAttempts) + 1;
    let revisionContext = this.readLatestRevisionContext(jobs);

    if (firstAttempt > MAX_ATTEMPTS) {
      return { status: 'CHANGES_REQUESTED', errorCode: 'CF4_GRAMMAR_ATTEMPTS_EXHAUSTED' };
    }

    for (let attempt = firstAttempt; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const typedAttempt = attempt as 1 | 2 | 3;
      const activeJobs: ActiveJob[] = [];
      const grammarInput = this.buildGrammarInput(
        params.target,
        params.batch,
        typedAttempt,
        revisionContext,
      );
      const grammarJob = await this.execution.enqueueAttempt({
        runId: params.runId,
        purpose: 'AUTHOR_GRAMMAR',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: grammarInput,
        attempt: typedAttempt,
        policyVersions: this.policy(CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
      });
      const grammarWorker = `${params.workerPrefix}:grammar:${params.target.code}:att${typedAttempt}`;

      try {
        await this.requireClaim(grammarJob.job.id, grammarWorker);
        activeJobs.push({ id: grammarJob.job.id, workerId: grammarWorker });
        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'GENERATING');
        await this.execution.reserveAiCallBudget({
          runId: params.runId,
          input: grammarInput,
          estimate: params.budgetPolicy.grammar,
        });

        const grammar = await this.grammarAuthor.authorPointWithinBatch(
          params.target,
          params.batch.points,
          params.targetVersion,
          typedAttempt === 1
            ? undefined
            : {
                attempt: typedAttempt,
                previousArtifactHash: revisionContext?.previousArtifactHash,
                reviewerFindings: revisionContext?.reviewerFindings,
                reasonCodes: revisionContext?.reasonCodes,
              },
        );
        const grammarJson = JSON.stringify(grammar);
        const grammarHash = computeSha256(grammarJson);
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
        const grammarValidationRunId = await this.runValidationAttempt({
          runId: params.runId,
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          inputContent: grammarJson,
          attempt: typedAttempt,
          validatorVersion: GRAMMAR_VALIDATOR_VERSION,
          report: grammarValidation,
          passed: grammarValidation.valid,
          workerId: `${params.workerPrefix}:validate-grammar:${params.target.code}:att${typedAttempt}`,
        });
        if (!grammarValidation.valid) {
          const errorCode = grammarValidation.findings[0]?.code ?? 'CF4_GRAMMAR_VALIDATION_FAILED';
          await this.finishFailedAttempt(
            grammarJob.job.id,
            grammarWorker,
            typedAttempt,
            errorCode,
          );
          if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
            return { status: 'QUARANTINED', errorCode };
          }
          revisionContext = this.nextRevisionContext(typedAttempt, grammarHash, [], [errorCode]);
          continue;
        }

        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'IN_REVIEW');
        const reviewPromptVersion = this.reviewPromptVersion(params.batch.reviewProfile);
        const reviewInput = JSON.stringify({
          phase: 'CF4',
          grammarHash,
          grammar,
          reviewProfile: params.batch.reviewProfile,
          attempt: typedAttempt,
        });
        const reviewJob = await this.execution.enqueueAttempt({
          runId: params.runId,
          purpose: 'REVIEW',
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          inputContent: grammarJson,
          attempt: typedAttempt,
          policyVersions: this.policy(reviewPromptVersion),
        });
        const reviewWorker = `${params.workerPrefix}:review:${params.target.code}:att${typedAttempt}`;
        await this.requireClaim(reviewJob.job.id, reviewWorker);
        activeJobs.push({ id: reviewJob.job.id, workerId: reviewWorker });
        await this.orchestrator.advanceJobState(reviewJob.job.id, reviewWorker, 'GENERATING');
        await this.execution.reserveAiCallBudget({
          runId: params.runId,
          input: reviewInput,
          estimate: params.budgetPolicy.review,
        });

        const review = await this.reviewer.reviewGrammarPoint({
          runId: params.runId,
          artifact: grammar,
          authorProvider: grammar.provenance.provider,
          authorModel: grammar.provenance.model,
          phase: 'CF4',
          reviewProfile: params.batch.reviewProfile,
        });
        const reviewRecord = await this.reviewRuns.record({
          runId: params.runId,
          jobId: reviewJob.job.id,
          report: review.report,
        });
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
          if (review.report.decision === 'REJECT' || review.report.decision === 'ESCALATE') {
            const errorCode =
              review.report.decision === 'ESCALATE'
                ? 'CF4_REVIEW_ESCALATION_REQUIRED'
                : 'CF4_REVIEW_REJECTED';
            await this.orchestrator.advanceJobState(
              reviewJob.job.id,
              reviewWorker,
              'QUARANTINED',
              undefined,
              errorCode,
            );
            await this.orchestrator.advanceJobState(
              grammarJob.job.id,
              grammarWorker,
              'QUARANTINED',
              undefined,
              errorCode,
            );
            return { status: 'QUARANTINED', errorCode };
          }

          await this.orchestrator.advanceJobState(
            reviewJob.job.id,
            reviewWorker,
            'CHANGES_REQUESTED',
            undefined,
            'CF4_REVIEW_CHANGES_REQUESTED',
          );
          await this.orchestrator.advanceJobState(
            grammarJob.job.id,
            grammarWorker,
            'CHANGES_REQUESTED',
            undefined,
            'CF4_REVIEW_CHANGES_REQUESTED',
          );
          if (typedAttempt === MAX_ATTEMPTS) {
            return {
              status: 'CHANGES_REQUESTED',
              errorCode: 'CF4_REVIEW_ATTEMPTS_EXHAUSTED',
            };
          }
          revisionContext = this.nextRevisionContext(
            typedAttempt,
            grammarHash,
            review.report.findings,
            review.report.findings.map((finding) => finding.code),
          );
          continue;
        }

        await this.orchestrator.advanceJobState(
          reviewJob.job.id,
          reviewWorker,
          'READY_FOR_APPROVAL',
        );
        await this.orchestrator.advanceJobState(
          grammarJob.job.id,
          grammarWorker,
          'READY_FOR_APPROVAL',
        );
        return {
          grammar,
          grammarJson,
          grammarHash,
          grammarJobId: grammarJob.job.id,
          grammarValidationRunId,
          reviewJobId: reviewJob.job.id,
          reviewRunId: reviewRecord.id,
          reviewReportHash: reviewRecord.reportHash,
          attempt: typedAttempt,
          resumed: false,
        };
      } catch (error: unknown) {
        const errorCode = this.normalizeErrorCode(error);
        await this.finishActiveJobs(activeJobs, typedAttempt, errorCode);
        if (errorCode === 'CF4_RUN_BUDGET_EXHAUSTED') {
          return { status: 'CHANGES_REQUESTED', errorCode };
        }
        if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
          return { status: 'QUARANTINED', errorCode };
        }
        revisionContext = this.nextRevisionContext(typedAttempt, undefined, [], [errorCode]);
      }
    }

    return { status: 'CHANGES_REQUESTED', errorCode: 'CF4_GRAMMAR_ATTEMPTS_EXHAUSTED' };
  }

  private async generateExercisesWithRetries(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    workerPrefix: string;
    budgetPolicy: Cf4ResilientBudgetPolicy;
    grammar: GrammarCheckpoint;
  }): Promise<ExerciseCheckpoint | RetryFailure> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const typedAttempt = attempt as 1 | 2 | 3;
      const exerciseSeed = [
        params.runId,
        params.batch.batchCode,
        params.target.code,
        `v${params.targetVersion}`,
        `att${typedAttempt}`,
      ].join(':');
      const exerciseInput = this.buildExerciseJobInput(
        params.grammar.grammarJson,
        params.batch.exerciseTargetPerPoint,
        exerciseSeed,
        typedAttempt,
      );
      const exerciseJob = await this.execution.enqueueAttempt({
        runId: params.runId,
        purpose: 'AUTHOR_EXERCISES',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: exerciseInput,
        attempt: typedAttempt,
        policyVersions: this.policy(CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
      });

      if (
        exerciseJob.job.state === 'QUARANTINED' ||
        exerciseJob.job.state === 'REJECTED' ||
        exerciseJob.job.state === 'CANCELLED' ||
        exerciseJob.job.state === 'RETRY_WAIT'
      ) {
        continue;
      }

      const exerciseWorker = `${params.workerPrefix}:exercise:${params.target.code}:att${typedAttempt}`;
      const activeJobs: ActiveJob[] = [];
      try {
        await this.requireClaim(exerciseJob.job.id, exerciseWorker);
        activeJobs.push({ id: exerciseJob.job.id, workerId: exerciseWorker });
        await this.orchestrator.advanceJobState(exerciseJob.job.id, exerciseWorker, 'GENERATING');
        await this.execution.reserveAiCallBudget({
          runId: params.runId,
          input: exerciseInput,
          estimate: {
            outputTokens:
              params.batch.exerciseTargetPerPoint *
              params.budgetPolicy.exerciseOutputTokensPerItem,
            estimatedCost: params.budgetPolicy.exerciseEstimatedCost,
          },
        });

        const exercises = await this.exerciseFactory.generateMinimumBankWithEvidence({
          grammarPoint: params.grammar.grammar,
          count: params.batch.exerciseTargetPerPoint,
          seed: exerciseSeed,
          promptVersion: CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
        });
        const exerciseJson = JSON.stringify(exercises.batch);
        const exerciseHash = computeSha256(exerciseJson);
        await this.orchestrator.advanceJobState(
          exerciseJob.job.id,
          exerciseWorker,
          'GENERATED',
          exerciseJson,
        );
        await this.orchestrator.advanceJobState(exerciseJob.job.id, exerciseWorker, 'VALIDATING');

        const deterministic = this.validator.validateExerciseBatchArtifact(
          exercises.batch,
          `${params.target.code}.exercise-batch.json`,
        );
        const report = {
          deterministic,
          preflight: exercises.preflightEvidence,
        };
        const passed = deterministic.valid && this.allPreflightEvidencePassed(exercises.preflightEvidence);
        const validationRunId = await this.runValidationAttempt({
          runId: params.runId,
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          inputContent: exerciseJson,
          attempt: typedAttempt,
          validatorVersion: EXERCISE_VALIDATOR_VERSION,
          report,
          passed,
          workerId: `${params.workerPrefix}:validate-exercise:${params.target.code}:att${typedAttempt}`,
        });
        if (!passed) {
          const errorCode =
            deterministic.findings[0]?.code ?? 'CF4_EXERCISE_VALIDATION_FAILED';
          await this.finishFailedAttempt(
            exerciseJob.job.id,
            exerciseWorker,
            typedAttempt,
            errorCode,
          );
          if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
            return { status: 'QUARANTINED', errorCode };
          }
          continue;
        }

        await this.orchestrator.advanceJobState(
          exerciseJob.job.id,
          exerciseWorker,
          'READY_FOR_APPROVAL',
        );
        return {
          exerciseJobId: exerciseJob.job.id,
          exerciseHash,
          exerciseValidationRunId: validationRunId,
          exerciseCount: exercises.batch.exercises.length,
          attempt: typedAttempt,
          resumed: false,
        };
      } catch (error: unknown) {
        const errorCode = this.normalizeErrorCode(error);
        await this.finishActiveJobs(activeJobs, typedAttempt, errorCode);
        if (errorCode === 'CF4_RUN_BUDGET_EXHAUSTED') {
          return { status: 'CHANGES_REQUESTED', errorCode };
        }
        if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
          return { status: 'QUARANTINED', errorCode };
        }
      }
    }

    return { status: 'CHANGES_REQUESTED', errorCode: 'CF4_EXERCISE_ATTEMPTS_EXHAUSTED' };
  }

  private async loadGrammarCheckpoint(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
  }): Promise<GrammarCheckpoint | null> {
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const expectedReviewPrompt = this.reviewPromptVersion(params.batch.reviewProfile);
    const policy = getContentReviewPolicy('CF4', params.batch.reviewProfile);
    const grammarJobs = jobs
      .filter(
        (job) =>
          job.purpose === 'AUTHOR_GRAMMAR' &&
          job.state === 'READY_FOR_APPROVAL' &&
          this.hasPinnedPolicy(job.policyVersionsJson, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
      )
      .sort((a, b) => b.attempt - a.attempt);

    for (const grammarJob of grammarJobs) {
      const grammarJson = this.readVerifiedOutput(grammarJob);
      if (!grammarJson || !grammarJob.outputHash) continue;
      const grammarHash = computeSha256(grammarJson);
      if (grammarHash !== grammarJob.outputHash) continue;

      let grammar: GrammarPointBundleSpec;
      try {
        grammar = JSON.parse(grammarJson) as GrammarPointBundleSpec;
      } catch {
        continue;
      }
      const deterministic = this.validator.validateGrammarPointArtifact(
        grammar,
        `${params.target.code}.v${params.targetVersion}.json`,
      );
      if (!deterministic.valid) continue;

      const validationJob = jobs.find(
        (job) =>
          job.purpose === 'VALIDATE' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === grammarHash &&
          this.hasPinnedPolicy(job.policyVersionsJson, GRAMMAR_VALIDATOR_VERSION),
      );
      const validationRun = validationJob?.validations.find(
        (validation) =>
          validation.artifactHash === grammarHash &&
          validation.validatorVersion === GRAMMAR_VALIDATOR_VERSION &&
          validation.passed,
      );
      if (!validationJob || !validationRun) continue;

      const reviewJob = jobs.find(
        (job) =>
          job.purpose === 'REVIEW' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === grammarHash &&
          this.hasPinnedPolicy(job.policyVersionsJson, expectedReviewPrompt),
      );
      const reviewRun = reviewJob?.reviews.find((review) => {
        if (
          review.artifactHash !== grammarHash ||
          review.promptVersion !== expectedReviewPrompt ||
          review.decision !== 'PASS'
        ) {
          return false;
        }
        const report = review.reportJson as unknown as ContentReviewReport;
        return isContentReviewReady(report, policy);
      });
      if (!reviewJob || !reviewRun) continue;

      return {
        grammar,
        grammarJson,
        grammarHash,
        grammarJobId: grammarJob.id,
        grammarValidationRunId: validationRun.id,
        reviewJobId: reviewJob.id,
        reviewRunId: reviewRun.id,
        reviewReportHash: reviewRun.reportHash,
        attempt: grammarJob.attempt,
        resumed: true,
      };
    }
    return null;
  }

  private async loadExerciseCheckpoint(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    grammar: GrammarCheckpoint;
  }): Promise<ExerciseCheckpoint | null> {
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const exerciseJobs = jobs
      .filter(
        (job) =>
          job.purpose === 'AUTHOR_EXERCISES' &&
          job.state === 'READY_FOR_APPROVAL' &&
          this.hasPinnedPolicy(job.policyVersionsJson, CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
      )
      .sort((a, b) => b.attempt - a.attempt);

    for (const exerciseJob of exerciseJobs) {
      const exerciseJson = this.readVerifiedOutput(exerciseJob);
      if (!exerciseJson || !exerciseJob.outputHash) continue;
      const exerciseHash = computeSha256(exerciseJson);
      if (exerciseHash !== exerciseJob.outputHash) continue;
      const parsed = this.readExerciseIdentity(exerciseJson);
      if (
        parsed.grammarPointHash !== params.grammar.grammarHash ||
        parsed.exerciseCount !== params.batch.exerciseTargetPerPoint
      ) {
        continue;
      }

      const validationJob = jobs.find(
        (job) =>
          job.purpose === 'VALIDATE' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === exerciseHash &&
          this.hasPinnedPolicy(job.policyVersionsJson, EXERCISE_VALIDATOR_VERSION),
      );
      const validationRun = validationJob?.validations.find(
        (validation) =>
          validation.artifactHash === exerciseHash &&
          validation.validatorVersion === EXERCISE_VALIDATOR_VERSION &&
          validation.passed,
      );
      if (!validationJob || !validationRun) continue;

      return {
        exerciseJobId: exerciseJob.id,
        exerciseHash,
        exerciseValidationRunId: validationRun.id,
        exerciseCount: parsed.exerciseCount,
        attempt: exerciseJob.attempt,
        resumed: true,
      };
    }
    return null;
  }

  private async runValidationAttempt(params: {
    runId: string;
    targetCode: string;
    targetVersion: number;
    inputContent: string;
    attempt: 1 | 2 | 3;
    validatorVersion: string;
    report: unknown;
    passed: boolean;
    workerId: string;
  }): Promise<string> {
    const job = await this.execution.enqueueAttempt({
      runId: params.runId,
      purpose: 'VALIDATE',
      targetCode: params.targetCode,
      targetVersion: params.targetVersion,
      inputContent: params.inputContent,
      attempt: params.attempt,
      policyVersions: this.policy(params.validatorVersion),
    });

    if (job.job.state === 'READY_FOR_APPROVAL') {
      const existing = await this.prisma.contentValidationRun.findFirst({
        where: {
          jobId: job.job.id,
          artifactHash: job.job.inputHash,
          validatorVersion: params.validatorVersion,
          passed: true,
        },
      });
      if (existing) return existing.id;
    }

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
    return validationRun.id;
  }

  private async findTargetJobs(runId: string, targetCode: string, targetVersion: number) {
    return this.prisma.contentFactoryJob.findMany({
      where: { runId, targetCode, targetVersion },
      include: { artifacts: true, validations: true, reviews: true },
    });
  }

  private readLatestRevisionContext(
    jobs: Awaited<ReturnType<Cf4ResilientLevelBatchService['findTargetJobs']>>,
  ): GrammarRevisionContext | undefined {
    const reviewJobs = jobs
      .filter(
        (job) =>
          job.purpose === 'REVIEW' &&
          (job.state === 'CHANGES_REQUESTED' || job.state === 'QUARANTINED'),
      )
      .sort((a, b) => b.attempt - a.attempt);
    for (const job of reviewJobs) {
      const review = job.reviews[0];
      if (!review || job.attempt >= MAX_ATTEMPTS) continue;
      const report = review.reportJson as unknown as ContentReviewReport;
      const nextAttempt = (job.attempt + 1) as 2 | 3;
      return {
        attempt: nextAttempt,
        previousArtifactHash: review.artifactHash,
        reviewerFindings: report.findings,
        reasonCodes: report.findings.map((finding) => finding.code),
      };
    }
    return undefined;
  }

  private nextRevisionContext(
    currentAttempt: 1 | 2 | 3,
    previousArtifactHash: string | undefined,
    reviewerFindings: unknown[],
    reasonCodes: string[],
  ): GrammarRevisionContext | undefined {
    if (currentAttempt >= MAX_ATTEMPTS) return undefined;
    return {
      attempt: (currentAttempt + 1) as 2 | 3,
      previousArtifactHash,
      reviewerFindings,
      reasonCodes,
    };
  }

  private buildGrammarInput(
    target: Cf4BatchPoint,
    batch: Cf4LevelBatch,
    attempt: 1 | 2 | 3,
    revisionContext?: GrammarRevisionContext,
  ): string {
    return JSON.stringify({
      phase: 'CF4',
      executionVersion: 'resilient-v1',
      batchCode: batch.batchCode,
      cefr: batch.cefr,
      batchCodes: batch.points.map((item) => item.code),
      attempt,
      manifestItem: target,
      revisionContext: revisionContext ?? null,
    });
  }

  private buildExerciseJobInput(
    grammarJson: string,
    exerciseCount: number,
    seed: string,
    attempt: 1 | 2 | 3,
  ): string {
    const grammarPoint: unknown = JSON.parse(grammarJson);
    return JSON.stringify({
      grammarPoint,
      exerciseCount,
      seed,
      attempt,
      promptVersion: CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
    });
  }

  private readExerciseIdentity(exerciseJson: string): {
    grammarPointHash: string | null;
    exerciseCount: number;
  } {
    try {
      const value = JSON.parse(exerciseJson) as Record<string, unknown>;
      return {
        grammarPointHash:
          typeof value.grammarPointHash === 'string' ? value.grammarPointHash : null,
        exerciseCount: Array.isArray(value.exercises) ? value.exercises.length : 0,
      };
    } catch {
      return { grammarPointHash: null, exerciseCount: 0 };
    }
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

  private reviewPromptVersion(profile: Cf4ReviewProfile): string {
    return profile === 'ADVANCED'
      ? CF4_ADVANCED_REVIEW_PROMPT_VERSION
      : CF4_REVIEW_PROMPT_VERSION;
  }

  private policy(prompt: string) {
    return {
      factory: FACTORY_POLICY_VERSION as const,
      schema: SCHEMA_VERSION,
      prompt,
    };
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

  private async requireClaim(jobId: string, workerId: string): Promise<void> {
    const claimed = await this.orchestrator.claimJob(jobId, workerId, 30);
    if (!claimed) throw new Error(`CF4_JOB_COULD_NOT_BE_CLAIMED:${jobId}`);
  }

  private async finishFailedAttempt(
    jobId: string,
    workerId: string,
    attempt: 1 | 2 | 3,
    errorCode: string,
  ): Promise<void> {
    const targetState: ContentFactoryJobState =
      attempt < MAX_ATTEMPTS && !this.isHardStop(errorCode) ? 'RETRY_WAIT' : 'QUARANTINED';
    const current = await this.prisma.contentFactoryJob.findUnique({ where: { id: jobId } });
    if (!current || current.workerId !== workerId) return;
    if (!canTransitionState(current.state, targetState)) return;
    await this.orchestrator.advanceJobState(jobId, workerId, targetState, undefined, errorCode);
  }

  private async finishActiveJobs(
    jobs: ActiveJob[],
    attempt: 1 | 2 | 3,
    errorCode: string,
  ): Promise<void> {
    for (const job of [...jobs].reverse()) {
      await this.finishFailedAttempt(job.id, job.workerId, attempt, errorCode).catch(() => undefined);
    }
  }

  private allPreflightEvidencePassed(evidence: ExercisePreflightEvidence[]): boolean {
    return evidence.every(
      (item) =>
        item.result.targetNecessityPassed &&
        item.result.ambiguityPassed &&
        item.result.evaluatorPassed,
    );
  }

  private isHardStop(errorCode: string): boolean {
    const upper = errorCode.toUpperCase();
    return (
      upper.includes('AUTHENTICATION') ||
      upper.includes('UNSAFE') ||
      upper.includes('SAFETY') ||
      upper.includes('LICENSE') ||
      upper.includes('PROMPT_INJECTION') ||
      upper.includes('SCHEMA_UNSUPPORTED') ||
      upper.includes('REVIEW_REJECTED') ||
      upper.includes('ESCALATION_REQUIRED')
    );
  }

  private normalizeErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : 'CF4_UNKNOWN_ERROR';
    return (message.split(':')[0] || 'CF4_UNKNOWN_ERROR').slice(0, 120);
  }

  private resolveBudgetPolicy(
    override?: Partial<Cf4ResilientBudgetPolicy>,
  ): Cf4ResilientBudgetPolicy {
    const resolved = {
      ...DEFAULT_BUDGET_POLICY,
      ...override,
      grammar: { ...DEFAULT_BUDGET_POLICY.grammar, ...(override?.grammar ?? {}) },
      review: { ...DEFAULT_BUDGET_POLICY.review, ...(override?.review ?? {}) },
    };
    if (
      resolved.grammar.outputTokens <= 0 ||
      resolved.review.outputTokens <= 0 ||
      resolved.exerciseOutputTokensPerItem <= 0 ||
      resolved.exerciseEstimatedCost < 0
    ) {
      throw new Error('CF4_BUDGET_POLICY_INVALID');
    }
    return resolved;
  }

  private assertBatchScope(batch: Cf4LevelBatch): void {
    if (batch.points.length < 3 || batch.points.length > 5) {
      throw new Error('CF4_BATCH_SCOPE_MUST_BE_3_TO_5_POINTS');
    }
    if (new Set(batch.points.map((point) => point.code)).size !== batch.points.length) {
      throw new Error('CF4_BATCH_TARGETS_MUST_BE_UNIQUE');
    }
    if (batch.points.some((point) => point.cefr !== batch.cefr)) {
      throw new Error('CF4_BATCH_TARGET_CEFR_MISMATCH');
    }
    const expectedProfile = batch.cefr === 'C1' || batch.cefr === 'C2' ? 'ADVANCED' : 'STANDARD';
    if (batch.reviewProfile !== expectedProfile) {
      throw new Error('CF4_BATCH_REVIEW_PROFILE_MISMATCH');
    }
    const expectedExercises =
      batch.cefr === 'A1' || batch.cefr === 'A2'
        ? 20
        : batch.cefr === 'B1' || batch.cefr === 'B2'
          ? 24
          : 30;
    if (batch.exerciseTargetPerPoint !== expectedExercises) {
      throw new Error('CF4_BATCH_EXERCISE_TARGET_MISMATCH');
    }
    if (!batch.requiresRegressionAfterBatch || !batch.requiresOwnerApprovalBeforePublish) {
      throw new Error('CF4_BATCH_SAFETY_FLAGS_REQUIRED');
    }
  }

  private emptyPointResult(code: string, version: number): Cf4ResilientPointResult {
    return {
      code,
      version,
      status: 'QUARANTINED',
      reviewProfile: null,
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
      grammarAttempt: null,
      exerciseAttempt: null,
      resumedFromCheckpoint: false,
      errorCode: null,
    };
  }

  private applyGrammarCheckpoint(
    result: Cf4ResilientPointResult,
    checkpoint: GrammarCheckpoint,
  ): void {
    result.reviewProfile = checkpoint.grammar.cefr === 'C1' || checkpoint.grammar.cefr === 'C2'
      ? 'ADVANCED'
      : 'STANDARD';
    result.grammarJobId = checkpoint.grammarJobId;
    result.grammarHash = checkpoint.grammarHash;
    result.grammarValidationRunId = checkpoint.grammarValidationRunId;
    result.reviewJobId = checkpoint.reviewJobId;
    result.reviewRunId = checkpoint.reviewRunId;
    result.reviewReportHash = checkpoint.reviewReportHash;
    result.grammarAttempt = checkpoint.attempt;
    result.resumedFromCheckpoint ||= checkpoint.resumed;
  }

  private applyExerciseCheckpoint(
    result: Cf4ResilientPointResult,
    checkpoint: ExerciseCheckpoint,
  ): void {
    result.exerciseJobId = checkpoint.exerciseJobId;
    result.exerciseHash = checkpoint.exerciseHash;
    result.exerciseValidationRunId = checkpoint.exerciseValidationRunId;
    result.exerciseCount = checkpoint.exerciseCount;
    result.exerciseAttempt = checkpoint.attempt;
    result.resumedFromCheckpoint ||= checkpoint.resumed;
  }

  private async persistReadinessReport(report: Cf4ResilientBatchReadinessReport): Promise<void> {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const hash = computeSha256(content);
    const artifact = this.storage.saveArtifact(
      report.runId,
      `cf4_${report.batchCode.toLowerCase()}_resilient_${hash.slice(0, 12)}.json`,
      content,
    );
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId: report.runId,
        artifactType: 'CF4_RESILIENT_BATCH_READINESS_REPORT',
        contentHash: artifact.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId: report.runId,
          artifactPath: artifact.artifactPath,
          artifactType: 'CF4_RESILIENT_BATCH_READINESS_REPORT',
          contentHash: artifact.contentHash,
          storageUri: artifact.storageUri,
          metadataJson: {
            phase: 'CF4',
            executionVersion: 'resilient-v1',
            batchCode: report.batchCode,
            cefr: report.cefr,
            status: report.status,
            regressionPassed: report.regression.passed,
            resumedPointCount: report.resumedPointCount,
          },
        },
      });
    }
  }
}
