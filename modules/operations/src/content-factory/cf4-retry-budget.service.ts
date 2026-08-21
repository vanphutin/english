import type { ContentFactoryJobState, PrismaClient } from '@prisma/client';
import {
  ContentFactoryValidator,
  validateContentReviewReport,
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
  Cf4LevelBatchService,
  type Cf4BatchPointResult,
  type Cf4BatchReadinessReport,
} from './cf4-level-batch.service.js';
import {
  Cf4ExecutionControl,
  type Cf4AiBudgetEstimate,
  type Cf4BudgetReservation,
} from './cf4-execution-control.js';

const FACTORY_POLICY_VERSION = 'content-factory-v1';
const SCHEMA_VERSION = '1.0';
const GRAMMAR_VALIDATOR_VERSION = 'CF4-GRAMMAR-v1';
const EXERCISE_VALIDATOR_VERSION = 'CF4-EXERCISE-v1';
const MAX_ATTEMPTS = 3 as const;

export interface Cf4RetryBudgetPolicy {
  grammar: Cf4AiBudgetEstimate;
  review: Cf4AiBudgetEstimate;
  exerciseOutputTokensPerItem: number;
  exerciseEstimatedCost: number;
  conservativeInputTokensPerReviewedGrammar: number;
  conservativeInputTokensPerExerciseBank: number;
}

const DEFAULT_POLICY: Cf4RetryBudgetPolicy = {
  grammar: { outputTokens: 3500, estimatedCost: 0 },
  review: { outputTokens: 2200, estimatedCost: 0 },
  exerciseOutputTokensPerItem: 350,
  exerciseEstimatedCost: 0,
  conservativeInputTokensPerReviewedGrammar: 4500,
  conservativeInputTokensPerExerciseBank: 5000,
};

export type Cf4RepairStatus =
  | 'NOT_NEEDED'
  | 'REPAIRED'
  | 'ATTEMPTS_EXHAUSTED'
  | 'HARD_STOP'
  | 'BUDGET_EXHAUSTED';

export interface Cf4PointRepairResult {
  code: string;
  status: Cf4RepairStatus;
  grammarAttempt: number | null;
  exerciseAttempt: number | null;
  errorCode: string | null;
}

export interface Cf4RetryBudgetRunResult {
  schemaVersion: '1.0';
  phase: 'CF4';
  executionVersion: 'retry-budget-v1';
  report: Cf4BatchReadinessReport;
  repairStatus: 'NOT_NEEDED' | 'REPAIRED' | 'INCOMPLETE';
  initialBudgetReservation: Cf4BudgetReservation | null;
  repairs: Cf4PointRepairResult[];
}

interface GrammarReadyEvidence {
  grammar: GrammarPointBundleSpec;
  grammarJson: string;
  grammarHash: string;
  grammarJobId: string;
  grammarValidationRunId: string;
  reviewJobId: string;
  reviewRunId: string;
  reviewReportHash: string;
  attempt: number;
}

interface ExerciseReadyEvidence {
  exerciseJobId: string;
  exerciseHash: string;
  exerciseValidationRunId: string;
  exerciseCount: number;
  attempt: number;
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
 * Wrapper around the contract-safe CF4 baseline service.
 *
 * - Attempt 1 stays owned by Cf4LevelBatchService.
 * - Retry/revision attempts 2 and 3 are immutable new jobs.
 * - Reviewer findings are persisted as retry-context evidence and passed to the
 *   author as non-authoritative feedback.
 * - Run budgets are reserved atomically before provider calls.
 * - When repairs succeed, the baseline service is run again and resumes from
 *   its verified grammar/exercise checkpoints; this class still cannot publish.
 */
export class Cf4RetryBudgetService {
  private readonly validator = new ContentFactoryValidator();
  private readonly execution: Cf4ExecutionControl;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly baseline: Cf4LevelBatchService,
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

  public async runWithRetries(params: {
    runId: string;
    manifestRunId: string;
    batch: Cf4LevelBatch;
    targetVersion?: number;
    workerPrefix?: string;
    budgetPolicy?: Partial<Cf4RetryBudgetPolicy>;
  }): Promise<Cf4RetryBudgetRunResult> {
    const targetVersion = params.targetVersion ?? 1;
    const workerPrefix = params.workerPrefix ?? `cf4-retry:${params.batch.batchCode}`;
    const policy = this.resolvePolicy(params.budgetPolicy);

    await this.manifestGate.assertApprovedBatch({
      manifestRunId: params.manifestRunId,
      batch: params.batch,
    });
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF4_RUN_NOT_FOUND');

    let initialBudgetReservation: Cf4BudgetReservation | null = null;
    let report = await this.loadLatestReadinessReport(params.runId, params.batch.batchCode);

    if (!report) {
      initialBudgetReservation = await this.reserveInitialAttemptEnvelope({
        runId: params.runId,
        batch: params.batch,
        policy,
      });
      report = await this.baseline.runBatch({
        runId: params.runId,
        manifestRunId: params.manifestRunId,
        batch: params.batch,
        targetVersion,
        workerPrefix: `${workerPrefix}:initial`,
      });
    }

    if (report.status === 'READY_FOR_APPROVAL') {
      return {
        schemaVersion: '1.0',
        phase: 'CF4',
        executionVersion: 'retry-budget-v1',
        report,
        repairStatus: 'NOT_NEEDED',
        initialBudgetReservation,
        repairs: report.points.map((point) => ({
          code: point.code,
          status: 'NOT_NEEDED',
          grammarAttempt: null,
          exerciseAttempt: null,
          errorCode: null,
        })),
      };
    }

    const repairs: Cf4PointRepairResult[] = [];
    for (const target of params.batch.points) {
      const point = report.points.find((candidate) => candidate.code === target.code);
      if (!point) {
        repairs.push({
          code: target.code,
          status: 'HARD_STOP',
          grammarAttempt: null,
          exerciseAttempt: null,
          errorCode: 'CF4_RETRY_REPORT_SCOPE_MISMATCH',
        });
        continue;
      }
      if (point.status === 'READY_FOR_APPROVAL') {
        repairs.push({
          code: target.code,
          status: 'NOT_NEEDED',
          grammarAttempt: null,
          exerciseAttempt: null,
          errorCode: null,
        });
        continue;
      }

      repairs.push(
        await this.repairPoint({
          runId: params.runId,
          batch: params.batch,
          target,
          targetVersion,
          point,
          workerPrefix,
          policy,
        }),
      );
    }

    const incomplete = repairs.some(
      (repair) => repair.status !== 'REPAIRED' && repair.status !== 'NOT_NEEDED',
    );
    if (!incomplete) {
      report = await this.baseline.runBatch({
        runId: params.runId,
        manifestRunId: params.manifestRunId,
        batch: params.batch,
        targetVersion,
        workerPrefix: `${workerPrefix}:resume`,
      });
    }

    const result: Cf4RetryBudgetRunResult = {
      schemaVersion: '1.0',
      phase: 'CF4',
      executionVersion: 'retry-budget-v1',
      report,
      repairStatus: incomplete ? 'INCOMPLETE' : 'REPAIRED',
      initialBudgetReservation,
      repairs,
    };
    await this.persistRetrySummary(params.runId, params.batch.batchCode, result);
    return result;
  }

  private async repairPoint(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    point: Cf4BatchPointResult;
    workerPrefix: string;
    policy: Cf4RetryBudgetPolicy;
  }): Promise<Cf4PointRepairResult> {
    if (params.point.errorCode && this.isHardStop(params.point.errorCode)) {
      return {
        code: params.target.code,
        status: 'HARD_STOP',
        grammarAttempt: null,
        exerciseAttempt: null,
        errorCode: params.point.errorCode,
      };
    }

    let grammar = await this.loadReadyGrammarEvidence(params);
    let grammarAttempt: number | null = grammar?.attempt ?? null;

    if (!grammar) {
      const grammarRepair = await this.retryGrammarAndReview(params);
      if ('status' in grammarRepair) return grammarRepair;
      grammar = grammarRepair;
      grammarAttempt = grammar.attempt;
    }

    const exercise = await this.loadReadyExerciseEvidence({ ...params, grammar });
    if (exercise) {
      return {
        code: params.target.code,
        status: 'REPAIRED',
        grammarAttempt,
        exerciseAttempt: exercise.attempt,
        errorCode: null,
      };
    }

    const exerciseRepair = await this.retryExercises({ ...params, grammar });
    if ('status' in exerciseRepair) {
      return {
        ...exerciseRepair,
        grammarAttempt,
      };
    }

    return {
      code: params.target.code,
      status: 'REPAIRED',
      grammarAttempt,
      exerciseAttempt: exerciseRepair.attempt,
      errorCode: null,
    };
  }

  private async retryGrammarAndReview(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    point: Cf4BatchPointResult;
    workerPrefix: string;
    policy: Cf4RetryBudgetPolicy;
  }): Promise<GrammarReadyEvidence | Cf4PointRepairResult> {
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const grammarJobs = jobs.filter(
      (job) =>
        job.purpose === 'AUTHOR_GRAMMAR' &&
        this.hasPinnedPolicy(job.policyVersionsJson, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
    );
    const latestGrammar = [...grammarJobs].sort((a, b) => b.attempt - a.attempt)[0];
    if (
      latestGrammar?.state === 'QUARANTINED' &&
      latestGrammar.normalizedErrorCode &&
      this.isHardStop(latestGrammar.normalizedErrorCode)
    ) {
      return {
        code: params.target.code,
        status: 'HARD_STOP',
        grammarAttempt: latestGrammar.attempt,
        exerciseAttempt: null,
        errorCode: latestGrammar.normalizedErrorCode,
      };
    }

    let revisionContext = this.readLatestRevisionContext(jobs);
    const firstAttempt = Math.max(1, ...grammarJobs.map((job) => job.attempt)) + 1;
    if (firstAttempt > MAX_ATTEMPTS) {
      return {
        code: params.target.code,
        status: 'ATTEMPTS_EXHAUSTED',
        grammarAttempt: MAX_ATTEMPTS,
        exerciseAttempt: null,
        errorCode: 'CF4_GRAMMAR_ATTEMPTS_EXHAUSTED',
      };
    }

    const approvedInput = this.buildGrammarInput(params.target, params.batch);
    for (let attempt = firstAttempt; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const typedAttempt = attempt as 2 | 3;
      const grammarJob = await this.execution.enqueueAttempt({
        runId: params.runId,
        purpose: 'AUTHOR_GRAMMAR',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: approvedInput,
        attempt: typedAttempt,
        policyVersions: this.policy(CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
      });
      const grammarWorker = `${params.workerPrefix}:grammar:${params.target.code}:att${typedAttempt}`;
      const activeJobs: ActiveJob[] = [];

      try {
        await this.persistRetryContext({
          runId: params.runId,
          jobId: grammarJob.job.id,
          targetCode: params.target.code,
          attempt: typedAttempt,
          stage: 'GRAMMAR_REVISION',
          value: revisionContext ?? { attempt: typedAttempt, reasonCodes: ['RETRY_WITHOUT_REVIEW'] },
        });
        await this.requireClaim(grammarJob.job.id, grammarWorker);
        activeJobs.push({ id: grammarJob.job.id, workerId: grammarWorker });
        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'GENERATING');
        await this.execution.reserveAiCallBudget({
          runId: params.runId,
          input: approvedInput,
          estimate: params.policy.grammar,
        });

        const grammar = await this.grammarAuthor.authorPointWithinBatch(
          params.target,
          params.batch.points,
          params.targetVersion,
          revisionContext ?? { attempt: typedAttempt, reasonCodes: ['RETRY_WITHOUT_REVIEW'] },
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

        const deterministic = this.validator.validateGrammarPointArtifact(
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
          report: deterministic,
          passed: deterministic.valid,
          workerId: `${params.workerPrefix}:validate-grammar:${params.target.code}:att${typedAttempt}`,
        });
        if (!deterministic.valid) {
          const errorCode = deterministic.findings[0]?.code ?? 'CF4_GRAMMAR_VALIDATION_FAILED';
          await this.finishFailedAttempt(
            grammarJob.job.id,
            grammarWorker,
            typedAttempt,
            errorCode,
          );
          if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
            return {
              code: params.target.code,
              status: this.isHardStop(errorCode) ? 'HARD_STOP' : 'ATTEMPTS_EXHAUSTED',
              grammarAttempt: typedAttempt,
              exerciseAttempt: null,
              errorCode,
            };
          }
          revisionContext = {
            attempt: (typedAttempt + 1) as 3,
            previousArtifactHash: grammarHash,
            reasonCodes: [errorCode],
          };
          continue;
        }

        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'IN_REVIEW');
        const reviewPromptVersion = this.reviewPromptVersion(params.batch.reviewProfile);
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
          input: grammarJson,
          estimate: params.policy.review,
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
            return {
              code: params.target.code,
              status: 'HARD_STOP',
              grammarAttempt: typedAttempt,
              exerciseAttempt: null,
              errorCode,
            };
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
              code: params.target.code,
              status: 'ATTEMPTS_EXHAUSTED',
              grammarAttempt: typedAttempt,
              exerciseAttempt: null,
              errorCode: 'CF4_REVIEW_ATTEMPTS_EXHAUSTED',
            };
          }
          revisionContext = {
            attempt: 3,
            previousArtifactHash: grammarHash,
            reviewerFindings: review.report.findings,
            reasonCodes: review.report.findings.map((finding) => finding.code),
          };
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
        };
      } catch (error: unknown) {
        const errorCode = this.normalizeErrorCode(error);
        await this.finishActiveJobs(activeJobs, typedAttempt, errorCode);
        if (errorCode === 'CF4_RUN_BUDGET_EXHAUSTED') {
          return {
            code: params.target.code,
            status: 'BUDGET_EXHAUSTED',
            grammarAttempt: typedAttempt,
            exerciseAttempt: null,
            errorCode,
          };
        }
        if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
          return {
            code: params.target.code,
            status: this.isHardStop(errorCode) ? 'HARD_STOP' : 'ATTEMPTS_EXHAUSTED',
            grammarAttempt: typedAttempt,
            exerciseAttempt: null,
            errorCode,
          };
        }
        revisionContext = {
          attempt: 3,
          reasonCodes: [errorCode],
        };
      }
    }

    return {
      code: params.target.code,
      status: 'ATTEMPTS_EXHAUSTED',
      grammarAttempt: MAX_ATTEMPTS,
      exerciseAttempt: null,
      errorCode: 'CF4_GRAMMAR_ATTEMPTS_EXHAUSTED',
    };
  }

  private async retryExercises(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    point: Cf4BatchPointResult;
    workerPrefix: string;
    policy: Cf4RetryBudgetPolicy;
    grammar: GrammarReadyEvidence;
  }): Promise<ExerciseReadyEvidence | Cf4PointRepairResult> {
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const exerciseJobs = jobs.filter(
      (job) =>
        job.purpose === 'AUTHOR_EXERCISES' &&
        this.hasPinnedPolicy(job.policyVersionsJson, CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
    );
    const firstAttempt = Math.max(1, ...exerciseJobs.map((job) => job.attempt)) + 1;
    if (firstAttempt > MAX_ATTEMPTS) {
      return {
        code: params.target.code,
        status: 'ATTEMPTS_EXHAUSTED',
        grammarAttempt: params.grammar.attempt,
        exerciseAttempt: MAX_ATTEMPTS,
        errorCode: 'CF4_EXERCISE_ATTEMPTS_EXHAUSTED',
      };
    }

    const exerciseSeed = `${params.runId}:${params.batch.batchCode}:${params.target.code}:v${params.targetVersion}`;
    const approvedInput = this.buildExerciseJobInput(
      params.grammar.grammarJson,
      params.batch.exerciseTargetPerPoint,
      exerciseSeed,
    );

    for (let attempt = firstAttempt; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const typedAttempt = attempt as 2 | 3;
      const job = await this.execution.enqueueAttempt({
        runId: params.runId,
        purpose: 'AUTHOR_EXERCISES',
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        inputContent: approvedInput,
        attempt: typedAttempt,
        policyVersions: this.policy(CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
      });
      const workerId = `${params.workerPrefix}:exercise:${params.target.code}:att${typedAttempt}`;
      const activeJobs: ActiveJob[] = [];

      try {
        await this.persistRetryContext({
          runId: params.runId,
          jobId: job.job.id,
          targetCode: params.target.code,
          attempt: typedAttempt,
          stage: 'EXERCISE_RETRY',
          value: {
            attempt: typedAttempt,
            previousErrorCode: params.point.errorCode,
            grammarHash: params.grammar.grammarHash,
          },
        });
        await this.requireClaim(job.job.id, workerId);
        activeJobs.push({ id: job.job.id, workerId });
        await this.orchestrator.advanceJobState(job.job.id, workerId, 'GENERATING');
        await this.execution.reserveAiCallBudget({
          runId: params.runId,
          input: approvedInput,
          estimate: {
            outputTokens:
              params.batch.exerciseTargetPerPoint * params.policy.exerciseOutputTokensPerItem,
            estimatedCost: params.policy.exerciseEstimatedCost,
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
        await this.orchestrator.advanceJobState(job.job.id, workerId, 'GENERATED', exerciseJson);
        await this.orchestrator.advanceJobState(job.job.id, workerId, 'VALIDATING');

        const deterministic = this.validator.validateExerciseBatchArtifact(
          exercises.batch,
          `${params.target.code}.exercise-batch.json`,
        );
        const validationReport = {
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
          report: validationReport,
          passed,
          workerId: `${params.workerPrefix}:validate-exercise:${params.target.code}:att${typedAttempt}`,
        });
        if (!passed) {
          const errorCode = deterministic.findings[0]?.code ?? 'CF4_EXERCISE_VALIDATION_FAILED';
          await this.finishFailedAttempt(job.job.id, workerId, typedAttempt, errorCode);
          if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
            return {
              code: params.target.code,
              status: this.isHardStop(errorCode) ? 'HARD_STOP' : 'ATTEMPTS_EXHAUSTED',
              grammarAttempt: params.grammar.attempt,
              exerciseAttempt: typedAttempt,
              errorCode,
            };
          }
          continue;
        }

        await this.orchestrator.advanceJobState(job.job.id, workerId, 'READY_FOR_APPROVAL');
        return {
          exerciseJobId: job.job.id,
          exerciseHash,
          exerciseValidationRunId: validationRunId,
          exerciseCount: exercises.batch.exercises.length,
          attempt: typedAttempt,
        };
      } catch (error: unknown) {
        const errorCode = this.normalizeErrorCode(error);
        await this.finishActiveJobs(activeJobs, typedAttempt, errorCode);
        if (errorCode === 'CF4_RUN_BUDGET_EXHAUSTED') {
          return {
            code: params.target.code,
            status: 'BUDGET_EXHAUSTED',
            grammarAttempt: params.grammar.attempt,
            exerciseAttempt: typedAttempt,
            errorCode,
          };
        }
        if (typedAttempt === MAX_ATTEMPTS || this.isHardStop(errorCode)) {
          return {
            code: params.target.code,
            status: this.isHardStop(errorCode) ? 'HARD_STOP' : 'ATTEMPTS_EXHAUSTED',
            grammarAttempt: params.grammar.attempt,
            exerciseAttempt: typedAttempt,
            errorCode,
          };
        }
      }
    }

    return {
      code: params.target.code,
      status: 'ATTEMPTS_EXHAUSTED',
      grammarAttempt: params.grammar.attempt,
      exerciseAttempt: MAX_ATTEMPTS,
      errorCode: 'CF4_EXERCISE_ATTEMPTS_EXHAUSTED',
    };
  }

  private async loadReadyGrammarEvidence(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
  }): Promise<GrammarReadyEvidence | null> {
    const grammarInputHash = computeSha256(this.buildGrammarInput(params.target, params.batch));
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const grammarJobs = jobs
      .filter(
        (job) =>
          job.purpose === 'AUTHOR_GRAMMAR' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === grammarInputHash &&
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
        const parsed: unknown = JSON.parse(grammarJson);
        const validation = this.validator.validateGrammarPointArtifact(
          parsed,
          `${params.target.code}.v${params.targetVersion}.json`,
        );
        if (!validation.valid) continue;
        grammar = parsed as GrammarPointBundleSpec;
      } catch {
        continue;
      }

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

      const reviewPrompt = this.reviewPromptVersion(params.batch.reviewProfile);
      const reviewJob = jobs.find(
        (job) =>
          job.purpose === 'REVIEW' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === grammarHash &&
          this.hasPinnedPolicy(job.policyVersionsJson, reviewPrompt),
      );
      const reviewRun = reviewJob?.reviews.find((review) => {
        if (
          review.artifactHash !== grammarHash ||
          review.promptVersion !== reviewPrompt ||
          review.decision !== 'PASS'
        ) {
          return false;
        }
        return this.isStoredReviewReady({
          reportJson: review.reportJson,
          runId: params.runId,
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          grammarHash,
          grammarProvider: grammar.provenance.provider,
          grammarModel: grammar.provenance.model,
          reviewProfile: params.batch.reviewProfile,
          expectedPromptVersion: reviewPrompt,
        });
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
      };
    }
    return null;
  }

  private async loadReadyExerciseEvidence(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    grammar: GrammarReadyEvidence;
  }): Promise<ExerciseReadyEvidence | null> {
    const seed = `${params.runId}:${params.batch.batchCode}:${params.target.code}:v${params.targetVersion}`;
    const inputHash = computeSha256(
      this.buildExerciseJobInput(
        params.grammar.grammarJson,
        params.batch.exerciseTargetPerPoint,
        seed,
      ),
    );
    const jobs = await this.findTargetJobs(params.runId, params.target.code, params.targetVersion);
    const exerciseJobs = jobs
      .filter(
        (job) =>
          job.purpose === 'AUTHOR_EXERCISES' &&
          job.state === 'READY_FOR_APPROVAL' &&
          job.inputHash === inputHash &&
          this.hasPinnedPolicy(job.policyVersionsJson, CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
      )
      .sort((a, b) => b.attempt - a.attempt);

    for (const exerciseJob of exerciseJobs) {
      const exerciseJson = this.readVerifiedOutput(exerciseJob);
      if (!exerciseJson || !exerciseJob.outputHash) continue;
      const exerciseHash = computeSha256(exerciseJson);
      if (exerciseHash !== exerciseJob.outputHash) continue;
      const exerciseCount = this.readExerciseCount(exerciseJson);
      if (exerciseCount !== params.batch.exerciseTargetPerPoint) continue;

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
        exerciseCount,
        attempt: exerciseJob.attempt,
      };
    }
    return null;
  }

  private async runValidationAttempt(params: {
    runId: string;
    targetCode: string;
    targetVersion: number;
    inputContent: string;
    attempt: 2 | 3;
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

  private async reserveInitialAttemptEnvelope(params: {
    runId: string;
    batch: Cf4LevelBatch;
    policy: Cf4RetryBudgetPolicy;
  }): Promise<Cf4BudgetReservation> {
    const grammarInputTokens = params.batch.points.reduce(
      (sum, point) => sum + this.execution.estimateInputTokens(this.buildGrammarInput(point, params.batch)),
      0,
    );
    const perPointOutput =
      params.policy.grammar.outputTokens +
      params.policy.review.outputTokens +
      params.batch.exerciseTargetPerPoint * params.policy.exerciseOutputTokensPerItem;
    const estimatedCostPerPoint =
      (params.policy.grammar.estimatedCost ?? 0) +
      (params.policy.review.estimatedCost ?? 0) +
      params.policy.exerciseEstimatedCost;

    return this.execution.reserveRunBudget(params.runId, {
      requests: params.batch.points.length * 3,
      inputTokens:
        grammarInputTokens +
        params.batch.points.length *
          (params.policy.conservativeInputTokensPerReviewedGrammar +
            params.policy.conservativeInputTokensPerExerciseBank),
      outputTokens: params.batch.points.length * perPointOutput,
      estimatedCost: params.batch.points.length * estimatedCostPerPoint,
    });
  }

  private async loadLatestReadinessReport(
    runId: string,
    batchCode: string,
  ): Promise<Cf4BatchReadinessReport | null> {
    const artifact = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId,
        artifactType: 'CF4_BATCH_READINESS_REPORT',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!artifact) return null;
    const metadata = artifact.metadataJson;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as Record<string, unknown>).batchCode !== batchCode
    ) {
      return null;
    }
    const filename = artifact.artifactPath.split('/').at(-1);
    if (!filename) return null;
    const content = this.storage.readArtifact(runId, filename);
    if (!content || computeSha256(content) !== artifact.contentHash) return null;
    try {
      const parsed = JSON.parse(content) as Cf4BatchReadinessReport;
      if (parsed.phase !== 'CF4' || parsed.batchCode !== batchCode || parsed.runId !== runId) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async persistRetryContext(params: {
    runId: string;
    jobId: string;
    targetCode: string;
    attempt: 2 | 3;
    stage: 'GRAMMAR_REVISION' | 'EXERCISE_RETRY';
    value: unknown;
  }): Promise<void> {
    const content = `${JSON.stringify(params.value, null, 2)}\n`;
    const hash = computeSha256(content);
    const filename = `cf4_retry_${params.targetCode.toLowerCase()}_att${params.attempt}_${hash.slice(0, 12)}.json`;
    const stored = this.storage.saveArtifact(params.runId, filename, content);
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId: params.runId,
        jobId: params.jobId,
        artifactType: 'CF4_RETRY_CONTEXT',
        contentHash: stored.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId: params.runId,
          jobId: params.jobId,
          artifactPath: stored.artifactPath,
          artifactType: 'CF4_RETRY_CONTEXT',
          contentHash: stored.contentHash,
          storageUri: stored.storageUri,
          metadataJson: {
            stage: params.stage,
            targetCode: params.targetCode,
            attempt: params.attempt,
          },
        },
      });
    }
  }

  private async persistRetrySummary(
    runId: string,
    batchCode: string,
    result: Cf4RetryBudgetRunResult,
  ): Promise<void> {
    const content = `${JSON.stringify(result, null, 2)}\n`;
    const hash = computeSha256(content);
    const filename = `cf4_${batchCode.toLowerCase()}_retry_summary_${hash.slice(0, 12)}.json`;
    const stored = this.storage.saveArtifact(runId, filename, content);
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId,
        artifactType: 'CF4_RETRY_SUMMARY',
        contentHash: stored.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId,
          artifactPath: stored.artifactPath,
          artifactType: 'CF4_RETRY_SUMMARY',
          contentHash: stored.contentHash,
          storageUri: stored.storageUri,
          metadataJson: {
            phase: 'CF4',
            executionVersion: 'retry-budget-v1',
            batchCode,
            repairStatus: result.repairStatus,
          },
        },
      });
    }
  }

  private async findTargetJobs(runId: string, targetCode: string, targetVersion: number) {
    return this.prisma.contentFactoryJob.findMany({
      where: { runId, targetCode, targetVersion },
      include: { artifacts: true, validations: true, reviews: true },
    });
  }

  private readLatestRevisionContext(
    jobs: Awaited<ReturnType<Cf4RetryBudgetService['findTargetJobs']>>,
  ): GrammarRevisionContext | undefined {
    const reviewJobs = jobs
      .filter((job) => job.purpose === 'REVIEW' && job.reviews.length > 0)
      .sort((a, b) => b.attempt - a.attempt);
    for (const job of reviewJobs) {
      if (job.attempt >= MAX_ATTEMPTS) continue;
      const review = job.reviews[0];
      if (!review) continue;
      const validation = validateContentReviewReport(review.reportJson);
      if (!validation.valid) continue;
      return {
        attempt: (job.attempt + 1) as 2 | 3,
        previousArtifactHash: review.artifactHash,
        reviewerFindings: validation.value.findings,
        reasonCodes: validation.value.findings.map((finding) => finding.code),
      };
    }
    return undefined;
  }

  private isStoredReviewReady(params: {
    reportJson: unknown;
    runId: string;
    targetCode: string;
    targetVersion: number;
    grammarHash: string;
    grammarProvider: string;
    grammarModel: string;
    reviewProfile: Cf4ReviewProfile;
    expectedPromptVersion: string;
  }): boolean {
    const validation = validateContentReviewReport(params.reportJson);
    if (!validation.valid) return false;
    const report: ContentReviewReport = validation.value;
    if (
      report.artifactCode !== params.targetCode ||
      report.artifactVersion !== params.targetVersion ||
      report.artifactHash !== params.grammarHash ||
      report.reviewer.runId !== params.runId ||
      report.reviewer.promptVersion !== params.expectedPromptVersion
    ) {
      return false;
    }
    if (
      report.reviewer.provider === params.grammarProvider &&
      report.reviewer.model === params.grammarModel
    ) {
      return false;
    }
    return isContentReviewReady(report, getContentReviewPolicy('CF4', params.reviewProfile));
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

  private buildGrammarInput(target: Cf4BatchPoint, batch: Cf4LevelBatch): string {
    return JSON.stringify({
      phase: 'CF4',
      batchCode: batch.batchCode,
      cefr: batch.cefr,
      batchCodes: batch.points.map((item) => item.code),
      manifestItem: target,
    });
  }

  private buildExerciseJobInput(grammarJson: string, exerciseCount: number, seed: string): string {
    const grammarPoint: unknown = JSON.parse(grammarJson);
    return JSON.stringify({
      grammarPoint,
      exerciseCount,
      seed,
      promptVersion: CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
    });
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
    attempt: 2 | 3,
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
    attempt: 2 | 3,
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

  private resolvePolicy(override?: Partial<Cf4RetryBudgetPolicy>): Cf4RetryBudgetPolicy {
    const policy = {
      ...DEFAULT_POLICY,
      ...override,
      grammar: { ...DEFAULT_POLICY.grammar, ...(override?.grammar ?? {}) },
      review: { ...DEFAULT_POLICY.review, ...(override?.review ?? {}) },
    };
    if (
      policy.grammar.outputTokens <= 0 ||
      policy.review.outputTokens <= 0 ||
      policy.exerciseOutputTokensPerItem <= 0 ||
      policy.exerciseEstimatedCost < 0 ||
      policy.conservativeInputTokensPerReviewedGrammar <= 0 ||
      policy.conservativeInputTokensPerExerciseBank <= 0
    ) {
      throw new Error('CF4_BUDGET_POLICY_INVALID');
    }
    return policy;
  }
}
