import type { PrismaClient } from '@prisma/client';
import { ContentFactoryValidator, validateContentReviewReport } from '@english/contracts';
import { canTransitionState } from './job-state-machine.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import {
  CF4_GRAMMAR_AUTHOR_PROMPT_VERSION,
  type GrammarPointBundleSpec,
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

const GRAMMAR_VALIDATOR_VERSION = 'CF4-GRAMMAR-v1';
const EXERCISE_VALIDATOR_VERSION = 'CF4-EXERCISE-v1';
const FACTORY_POLICY_VERSION = 'content-factory-v1';
const SCHEMA_VERSION = '1.0';

export type Cf4PointStatus = 'READY_FOR_APPROVAL' | 'CHANGES_REQUESTED' | 'QUARANTINED';

export interface Cf4BatchPointResult {
  code: string;
  version: number;
  status: Cf4PointStatus;
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
  errorCode: string | null;
}

export interface Cf4BatchReadinessReport {
  schemaVersion: '1.0';
  phase: 'CF4';
  runId: string;
  manifestRunId: string;
  batchCode: string;
  cefr: Cf4LevelBatch['cefr'];
  reviewProfile: Cf4ReviewProfile;
  exerciseTargetPerPoint: number;
  status: 'READY_FOR_APPROVAL' | 'DRAFT_ONLY';
  targetCount: number;
  readyCount: number;
  regression: Cf4BatchRegressionReport;
  points: Cf4BatchPointResult[];
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

interface ReviewedGrammarCheckpoint {
  grammar: GrammarPointBundleSpec;
  grammarJson: string;
  grammarJobId: string;
  grammarHash: string;
  grammarValidationRunId: string;
  reviewJobId: string;
  reviewRunId: string;
  reviewReportHash: string;
  reviewProfile: Cf4ReviewProfile;
}

/**
 * CF4 level-batch coordinator. It consumes exactly one deterministic 3–5 point
 * batch from an owner-approved manifest, runs every point through authoring,
 * deterministic validation, independent review, exercise authoring/preflight,
 * and a post-batch regression gate. It has no publication capability.
 */
export class Cf4LevelBatchService {
  private readonly validator = new ContentFactoryValidator();
  private readonly regression = new Cf4BatchRegressionValidator();

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
  ) {}

  public async runBatch(params: {
    runId: string;
    manifestRunId: string;
    batch: Cf4LevelBatch;
    targetVersion?: number;
    workerPrefix?: string;
  }): Promise<Cf4BatchReadinessReport> {
    this.assertBatchScope(params.batch);
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF4_RUN_NOT_FOUND');
    await this.manifestGate.assertApprovedBatch({
      manifestRunId: params.manifestRunId,
      batch: params.batch,
    });

    const targetVersion = params.targetVersion ?? 1;
    const workerPrefix = params.workerPrefix ?? `cf4:${params.batch.batchCode}`;
    const resumedPoints = await Promise.all(
      params.batch.points.map((target) =>
        this.tryLoadCompletedPoint({
          runId: params.runId,
          batch: params.batch,
          target,
          targetVersion,
        }),
      ),
    );

    const points: Cf4BatchPointResult[] = [];
    for (const [index, target] of params.batch.points.entries()) {
      const resumedPoint = resumedPoints[index];
      points.push(
        resumedPoint ??
          (await this.runPoint({
            runId: params.runId,
            batch: params.batch,
            target,
            targetVersion,
            workerPrefix,
          })),
      );
    }

    const regression = this.regression.validate(params.batch, points);
    const readyCount = points.filter((point) => point.status === 'READY_FOR_APPROVAL').length;
    const status =
      readyCount === params.batch.points.length && regression.passed
        ? 'READY_FOR_APPROVAL'
        : 'DRAFT_ONLY';
    const report: Cf4BatchReadinessReport = {
      schemaVersion: '1.0',
      phase: 'CF4',
      runId: params.runId,
      manifestRunId: params.manifestRunId,
      batchCode: params.batch.batchCode,
      cefr: params.batch.cefr,
      reviewProfile: params.batch.reviewProfile,
      exerciseTargetPerPoint: params.batch.exerciseTargetPerPoint,
      status,
      targetCount: params.batch.points.length,
      readyCount,
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
  }): Promise<Cf4BatchPointResult> {
    const result: Cf4BatchPointResult = {
      code: params.target.code,
      version: params.targetVersion,
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
      errorCode: null,
    };
    const activeJobs: ActiveJob[] = [];

    try {
      const checkpoint = await this.tryLoadReviewedGrammarCheckpoint(params);
      let grammar: GrammarPointBundleSpec;
      let grammarJson: string;

      if (checkpoint) {
        grammar = checkpoint.grammar;
        grammarJson = checkpoint.grammarJson;
        result.grammarJobId = checkpoint.grammarJobId;
        result.grammarHash = checkpoint.grammarHash;
        result.grammarValidationRunId = checkpoint.grammarValidationRunId;
        result.reviewJobId = checkpoint.reviewJobId;
        result.reviewRunId = checkpoint.reviewRunId;
        result.reviewReportHash = checkpoint.reviewReportHash;
        result.reviewProfile = checkpoint.reviewProfile;
      } else {
        const grammarInput = this.buildGrammarInput(params.target, params.batch);
        const grammarJob = await this.orchestrator.enqueueJob({
          runId: params.runId,
          purpose: 'AUTHOR_GRAMMAR',
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          inputContent: grammarInput,
          policyVersions: {
            factory: FACTORY_POLICY_VERSION,
            schema: SCHEMA_VERSION,
            prompt: CF4_GRAMMAR_AUTHOR_PROMPT_VERSION,
          },
        });
        result.grammarJobId = grammarJob.job.id;
        const grammarWorker = `${params.workerPrefix}:grammar:${params.target.code}`;
        await this.requireClaim(grammarJob.job.id, grammarWorker);
        activeJobs.push({ id: grammarJob.job.id, workerId: grammarWorker });
        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'GENERATING');

        grammar = await this.grammarAuthor.authorPointWithinBatch(
          params.target,
          params.batch.points,
          params.targetVersion,
        );
        grammarJson = JSON.stringify(grammar);
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
            grammarValidation.findings[0]?.code ?? 'CF4_GRAMMAR_VALIDATION_FAILED',
          );
          result.errorCode =
            grammarValidation.findings[0]?.code ?? 'CF4_GRAMMAR_VALIDATION_FAILED';
          return result;
        }

        await this.orchestrator.advanceJobState(grammarJob.job.id, grammarWorker, 'IN_REVIEW');
        const reviewPromptVersion = this.reviewPromptVersion(params.batch.reviewProfile);
        const reviewJob = await this.orchestrator.enqueueJob({
          runId: params.runId,
          purpose: 'REVIEW',
          targetCode: params.target.code,
          targetVersion: params.targetVersion,
          inputContent: grammarJson,
          policyVersions: {
            factory: FACTORY_POLICY_VERSION,
            schema: SCHEMA_VERSION,
            prompt: reviewPromptVersion,
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
          phase: 'CF4',
          reviewProfile: params.batch.reviewProfile,
        });
        result.reviewProfile = review.reviewProfile;
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
            'CF4_REVIEW_CHANGES_REQUESTED',
          );
          await this.orchestrator.advanceJobState(
            grammarJob.job.id,
            grammarWorker,
            'CHANGES_REQUESTED',
            undefined,
            'CF4_REVIEW_CHANGES_REQUESTED',
          );
          result.status = 'CHANGES_REQUESTED';
          result.errorCode = 'CF4_REVIEW_CHANGES_REQUESTED';
          return result;
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
      }

      return await this.runExerciseStage({
        ...params,
        grammar,
        grammarJson,
        result,
        activeJobs,
      });
    } catch (error: unknown) {
      const errorCode = this.normalizeErrorCode(error);
      result.errorCode = errorCode;
      await this.quarantineActiveJobs(activeJobs, errorCode);
      return result;
    }
  }

  private async runExerciseStage(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
    workerPrefix: string;
    grammar: GrammarPointBundleSpec;
    grammarJson: string;
    result: Cf4BatchPointResult;
    activeJobs: ActiveJob[];
  }): Promise<Cf4BatchPointResult> {
    const exerciseSeed = `${params.runId}:${params.batch.batchCode}:${params.target.code}:v${params.targetVersion}`;
    const exerciseInput = this.buildExerciseJobInput(
      params.grammarJson,
      params.batch.exerciseTargetPerPoint,
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
        prompt: CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
      },
    });
    params.result.exerciseJobId = exerciseJob.job.id;
    const exerciseWorker = `${params.workerPrefix}:exercise:${params.target.code}`;
    await this.requireClaim(exerciseJob.job.id, exerciseWorker);
    params.activeJobs.push({ id: exerciseJob.job.id, workerId: exerciseWorker });
    await this.orchestrator.advanceJobState(exerciseJob.job.id, exerciseWorker, 'GENERATING');

    const exercises = await this.exerciseFactory.generateMinimumBankWithEvidence({
      grammarPoint: params.grammar,
      count: params.batch.exerciseTargetPerPoint,
      seed: exerciseSeed,
      promptVersion: CF4_EXERCISE_AUTHOR_PROMPT_VERSION,
    });
    const exerciseJson = JSON.stringify(exercises.batch);
    params.result.exerciseHash = computeSha256(exerciseJson);
    params.result.exerciseCount = exercises.batch.exercises.length;
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
    params.result.exerciseValidationRunId = exerciseValidationEvidence.validationRunId;

    if (!exercisePassed) {
      await this.orchestrator.advanceJobState(
        exerciseJob.job.id,
        exerciseWorker,
        'QUARANTINED',
        undefined,
        'CF4_EXERCISE_VALIDATION_FAILED',
      );
      params.result.errorCode = 'CF4_EXERCISE_VALIDATION_FAILED';
      return params.result;
    }

    await this.orchestrator.advanceJobState(
      exerciseJob.job.id,
      exerciseWorker,
      'READY_FOR_APPROVAL',
    );
    params.result.status = 'READY_FOR_APPROVAL';
    return params.result;
  }

  private async tryLoadCompletedPoint(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
  }): Promise<Cf4BatchPointResult | null> {
    const grammarInputHash = computeSha256(this.buildGrammarInput(params.target, params.batch));
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
        this.hasPinnedPolicy(job.policyVersionsJson, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
    );
    if (!grammarJob?.outputHash) return null;

    const grammarJson = this.readVerifiedOutput(grammarJob);
    if (!grammarJson) return null;
    const grammarHash = computeSha256(grammarJson);
    if (grammarHash !== grammarJob.outputHash) return null;

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

    const expectedReviewPrompt = this.reviewPromptVersion(params.batch.reviewProfile);
    const reviewJob = jobs.find(
      (job) =>
        job.purpose === 'REVIEW' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === grammarHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, expectedReviewPrompt),
    );
    const reviewRun = reviewJob?.reviews.find(
      (review) =>
        review.artifactHash === grammarHash &&
        review.promptVersion === expectedReviewPrompt &&
        review.decision === 'PASS',
    );
    if (!reviewJob || !reviewRun) return null;
    if (
      !this.isStoredReviewReady({
        reportJson: reviewRun.reportJson,
        runId: params.runId,
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        grammarHash,
        grammarProvider: this.readGrammarProvider(grammarJson),
        grammarModel: this.readGrammarModel(grammarJson),
        reviewProfile: params.batch.reviewProfile,
        expectedPromptVersion: expectedReviewPrompt,
      })
    ) {
      return null;
    }

    const exerciseSeed = `${params.runId}:${params.batch.batchCode}:${params.target.code}:v${params.targetVersion}`;
    const exerciseInputHash = computeSha256(
      this.buildExerciseJobInput(
        grammarJson,
        params.batch.exerciseTargetPerPoint,
        exerciseSeed,
      ),
    );
    const exerciseJob = jobs.find(
      (job) =>
        job.purpose === 'AUTHOR_EXERCISES' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === exerciseInputHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, CF4_EXERCISE_AUTHOR_PROMPT_VERSION),
    );
    if (!exerciseJob?.outputHash) return null;

    const exerciseJson = this.readVerifiedOutput(exerciseJob);
    if (!exerciseJson) return null;
    const exerciseHash = computeSha256(exerciseJson);
    if (exerciseHash !== exerciseJob.outputHash) return null;
    const exerciseCount = this.readExerciseCount(exerciseJson);
    if (exerciseCount !== params.batch.exerciseTargetPerPoint) return null;

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
      reviewProfile: params.batch.reviewProfile,
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

  private async tryLoadReviewedGrammarCheckpoint(params: {
    runId: string;
    batch: Cf4LevelBatch;
    target: Cf4BatchPoint;
    targetVersion: number;
  }): Promise<ReviewedGrammarCheckpoint | null> {
    const grammarInputHash = computeSha256(this.buildGrammarInput(params.target, params.batch));
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
        this.hasPinnedPolicy(job.policyVersionsJson, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION),
    );
    if (!grammarJob?.outputHash) return null;
    const grammarJson = this.readVerifiedOutput(grammarJob);
    if (!grammarJson || computeSha256(grammarJson) !== grammarJob.outputHash) return null;

    let grammar: GrammarPointBundleSpec;
    try {
      const parsed: unknown = JSON.parse(grammarJson);
      const validation = this.validator.validateGrammarPointArtifact(
        parsed,
        `${params.target.code}.v${params.targetVersion}.json`,
      );
      if (!validation.valid) return null;
      grammar = parsed as GrammarPointBundleSpec;
    } catch {
      return null;
    }
    const grammarHash = grammarJob.outputHash;

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

    const expectedReviewPrompt = this.reviewPromptVersion(params.batch.reviewProfile);
    const reviewJob = jobs.find(
      (job) =>
        job.purpose === 'REVIEW' &&
        job.state === 'READY_FOR_APPROVAL' &&
        job.inputHash === grammarHash &&
        this.hasPinnedPolicy(job.policyVersionsJson, expectedReviewPrompt),
    );
    const reviewRun = reviewJob?.reviews.find(
      (review) =>
        review.artifactHash === grammarHash &&
        review.promptVersion === expectedReviewPrompt &&
        review.decision === 'PASS',
    );
    if (!reviewJob || !reviewRun) return null;
    if (
      !this.isStoredReviewReady({
        reportJson: reviewRun.reportJson,
        runId: params.runId,
        targetCode: params.target.code,
        targetVersion: params.targetVersion,
        grammarHash,
        grammarProvider: grammar.provenance.provider,
        grammarModel: grammar.provenance.model,
        reviewProfile: params.batch.reviewProfile,
        expectedPromptVersion: expectedReviewPrompt,
      })
    ) {
      return null;
    }

    return {
      grammar,
      grammarJson,
      grammarJobId: grammarJob.id,
      grammarHash,
      grammarValidationRunId: grammarValidationRun.id,
      reviewJobId: reviewJob.id,
      reviewRunId: reviewRun.id,
      reviewReportHash: reviewRun.reportHash,
      reviewProfile: params.batch.reviewProfile,
    };
  }

  private isStoredReviewReady(params: {
    reportJson: unknown;
    runId: string;
    targetCode: string;
    targetVersion: number;
    grammarHash: string;
    grammarProvider: string | null;
    grammarModel: string | null;
    reviewProfile: Cf4ReviewProfile;
    expectedPromptVersion: string;
  }): boolean {
    const validation = validateContentReviewReport(params.reportJson);
    if (!validation.valid) return false;
    const report = validation.value;
    if (
      report.artifactCode !== params.targetCode ||
      report.artifactVersion !== params.targetVersion ||
      report.artifactHash !== params.grammarHash ||
      report.reviewer.runId !== params.runId ||
      report.reviewer.promptVersion !== params.expectedPromptVersion ||
      (report.reviewer.provider === params.grammarProvider &&
        report.reviewer.model === params.grammarModel)
    ) {
      return false;
    }
    const policy = getContentReviewPolicy('CF4', params.reviewProfile);
    return policy.promptVersion === params.expectedPromptVersion && isContentReviewReady(report, policy);
  }

  private readGrammarProvider(grammarJson: string): string | null {
    try {
      const value: unknown = JSON.parse(grammarJson);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const provenance = (value as Record<string, unknown>).provenance;
      if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
      const provider = (provenance as Record<string, unknown>).provider;
      return typeof provider === 'string' ? provider : null;
    } catch {
      return null;
    }
  }

  private readGrammarModel(grammarJson: string): string | null {
    try {
      const value: unknown = JSON.parse(grammarJson);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const provenance = (value as Record<string, unknown>).provenance;
      if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
      const model = (provenance as Record<string, unknown>).model;
      return typeof model === 'string' ? model : null;
    } catch {
      return null;
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
    if (!claimed) throw new Error(`CF4_JOB_COULD_NOT_BE_CLAIMED:${jobId}`);
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
    const message = error instanceof Error ? error.message : 'CF4_UNKNOWN_ERROR';
    return (message.split(':')[0] || 'CF4_UNKNOWN_ERROR').slice(0, 120);
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

  private async persistReadinessReport(report: Cf4BatchReadinessReport): Promise<void> {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const hash = computeSha256(content);
    const artifact = this.storage.saveArtifact(
      report.runId,
      `cf4_${report.batchCode.toLowerCase()}_readiness_${hash.slice(0, 12)}.json`,
      content,
    );
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId: report.runId,
        artifactType: 'CF4_BATCH_READINESS_REPORT',
        contentHash: artifact.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId: report.runId,
          artifactPath: artifact.artifactPath,
          artifactType: 'CF4_BATCH_READINESS_REPORT',
          contentHash: artifact.contentHash,
          storageUri: artifact.storageUri,
          metadataJson: {
            phase: 'CF4',
            batchCode: report.batchCode,
            cefr: report.cefr,
            status: report.status,
            regressionPassed: report.regression.passed,
          },
        },
      });
    }
  }
}
