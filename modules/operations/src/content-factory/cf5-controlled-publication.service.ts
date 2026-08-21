import { Prisma, type PrismaClient } from '@prisma/client';
import { ContentFactoryValidator } from '@english/contracts';
import type { AutonomousManifest, CurriculumPointSpec } from './manifest-planner.js';
import type { GrammarPointBundleSpec } from './lesson-generator.js';
import type { ExerciseAuthoringBatchSpec, ExerciseItemSpec } from './exercise-factory.js';
import type { Cf4BatchReadinessReport } from './cf4-level-batch.service.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

export interface Cf5PublishedPointResult {
  code: string;
  version: number;
  grammarPointVersionId: string;
  grammarHash: string;
  exerciseHash: string;
  exerciseCount: number;
}

export interface Cf5ControlledPublicationResult {
  schemaVersion: '1.0';
  phase: 'CF5';
  operation: 'PUBLISH_APPROVED_CF4_BATCH';
  runId: string;
  manifestRunId: string;
  batchCode: string;
  batchHash: string;
  approvalId: string;
  pointCount: number;
  exerciseCount: number;
  points: Cf5PublishedPointResult[];
  publishedAt: string;
}

interface PreparedPoint {
  result: Cf4BatchReadinessReport['points'][number];
  grammar: GrammarPointBundleSpec;
  exerciseBatch: ExerciseAuthoringBatchSpec;
}

/**
 * Explicit human-triggered bridge from an owner-approved CF4 batch into the
 * immutable learner-content tables. This service never creates owner approval
 * and never activates a curriculum release.
 */
export class Cf5ControlledPublicationService {
  private readonly validator = new ContentFactoryValidator();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async publishApprovedBatch(params: {
    runId: string;
    expectedScopeHash: string;
    confirmation: string;
  }): Promise<Cf5ControlledPublicationResult> {
    if (params.confirmation !== `PUBLISH:${params.expectedScopeHash}`) {
      throw new Error('CF5_PUBLICATION_CONFIRMATION_MISMATCH');
    }

    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF5_REQUIRES_OWNER_APPROVED_CF4_RUN');
    }
    if (run.manifestHash !== params.expectedScopeHash) {
      throw new Error('CF5_PUBLICATION_SCOPE_HASH_MISMATCH');
    }
    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: params.runId, scopeHash: params.expectedScopeHash },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval) throw new Error('CF5_OWNER_APPROVAL_EVIDENCE_MISSING');

    const existingPublication = await this.prisma.contentPublication.findUnique({
      where: { batchHash: params.expectedScopeHash },
    });
    if (existingPublication) {
      if (
        existingPublication.runId !== params.runId ||
        existingPublication.approvalId !== approval.id ||
        existingPublication.status !== 'PUBLISHED'
      ) {
        throw new Error('CF5_PUBLICATION_IDEMPOTENCY_CONFLICT');
      }
      return existingPublication.resultJson as unknown as Cf5ControlledPublicationResult;
    }

    const report = await this.loadVerifiedReadinessReport(params.runId);
    const computedScopeHash = this.computeCf4ScopeHash(report);
    if (computedScopeHash !== params.expectedScopeHash) {
      throw new Error('CF5_READINESS_SCOPE_CHANGED_AFTER_APPROVAL');
    }
    const manifest = await this.loadApprovedManifest(report.manifestRunId);
    const manifestPoints = this.indexManifestPoints(manifest);
    const prepared = await this.preparePointArtifacts(params.runId, report, manifestPoints);

    return this.prisma.$transaction(
      async (tx) => {
        const concurrent = await tx.contentPublication.findUnique({
          where: { batchHash: params.expectedScopeHash },
        });
        if (concurrent) {
          if (
            concurrent.runId !== params.runId ||
            concurrent.approvalId !== approval.id ||
            concurrent.status !== 'PUBLISHED'
          ) {
            throw new Error('CF5_PUBLICATION_IDEMPOTENCY_CONFLICT');
          }
          return concurrent.resultJson as unknown as Cf5ControlledPublicationResult;
        }

        const identities = new Map<string, { id: string; code: string }>();
        for (const point of manifestPoints.values()) {
          const identity = await tx.grammarPoint.upsert({
            where: { code: point.code },
            create: {
              code: point.code,
              familyCode: point.family,
              canonicalSlug: point.canonicalSlug,
              status: 'DRAFT',
            },
            update: {},
            select: { id: true, code: true, familyCode: true, canonicalSlug: true },
          });
          if (
            identity.familyCode !== point.family ||
            identity.canonicalSlug !== point.canonicalSlug
          ) {
            throw new Error(`CF5_GRAMMAR_IDENTITY_IMMUTABLE:${point.code}`);
          }
          identities.set(point.code, { id: identity.id, code: identity.code });
        }

        const publishedVersions = new Map<string, string>();
        const pointResults: Cf5PublishedPointResult[] = [];
        for (const item of prepared) {
          const identity = identities.get(item.grammar.code);
          if (!identity) throw new Error(`CF5_MANIFEST_POINT_MISSING:${item.grammar.code}`);

          const versionId = await this.publishGrammarVersion(tx, identity.id, item.grammar);
          publishedVersions.set(item.grammar.code, versionId);

          const exerciseCount = await this.publishExerciseBatch(
            tx,
            versionId,
            item.grammar,
            item.exerciseBatch,
          );
          pointResults.push({
            code: item.grammar.code,
            version: item.grammar.version,
            grammarPointVersionId: versionId,
            grammarHash: item.result.grammarHash!,
            exerciseHash: item.result.exerciseHash!,
            exerciseCount,
          });
        }

        await this.upsertRelationships(tx, prepared, identities, publishedVersions);

        const publishedAt = new Date();
        const result: Cf5ControlledPublicationResult = {
          schemaVersion: '1.0',
          phase: 'CF5',
          operation: 'PUBLISH_APPROVED_CF4_BATCH',
          runId: params.runId,
          manifestRunId: report.manifestRunId,
          batchCode: report.batchCode,
          batchHash: params.expectedScopeHash,
          approvalId: approval.id,
          pointCount: pointResults.length,
          exerciseCount: pointResults.reduce((sum, point) => sum + point.exerciseCount, 0),
          points: pointResults,
          publishedAt: publishedAt.toISOString(),
        };

        await tx.contentPublication.create({
          data: {
            runId: params.runId,
            approvalId: approval.id,
            batchHash: params.expectedScopeHash,
            status: 'PUBLISHED',
            releaseId: null,
            resultJson: result as unknown as Prisma.InputJsonObject,
            publishedAt,
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async preparePointArtifacts(
    runId: string,
    report: Cf4BatchReadinessReport,
    manifestPoints: Map<string, CurriculumPointSpec>,
  ): Promise<PreparedPoint[]> {
    if (
      report.status !== 'READY_FOR_APPROVAL' ||
      !report.regression.passed ||
      report.readyCount !== report.targetCount
    ) {
      throw new Error('CF5_CF4_REPORT_NOT_PUBLICATION_READY');
    }

    const prepared: PreparedPoint[] = [];
    for (const point of report.points) {
      if (
        point.status !== 'READY_FOR_APPROVAL' ||
        !point.grammarJobId ||
        !point.grammarHash ||
        !point.grammarValidationRunId ||
        !point.reviewJobId ||
        !point.reviewRunId ||
        !point.reviewReportHash ||
        !point.exerciseJobId ||
        !point.exerciseHash ||
        !point.exerciseValidationRunId ||
        point.errorCode
      ) {
        throw new Error(`CF5_POINT_EVIDENCE_INCOMPLETE:${point.code}`);
      }
      if (!manifestPoints.has(point.code)) {
        throw new Error(`CF5_POINT_OUTSIDE_APPROVED_MANIFEST:${point.code}`);
      }

      const grammarJson = await this.readVerifiedJobOutput(runId, point.grammarJobId, point.grammarHash);
      const exerciseJson = await this.readVerifiedJobOutput(
        runId,
        point.exerciseJobId,
        point.exerciseHash,
      );

      let grammar: GrammarPointBundleSpec;
      let exerciseBatch: ExerciseAuthoringBatchSpec;
      try {
        grammar = JSON.parse(grammarJson) as GrammarPointBundleSpec;
        exerciseBatch = JSON.parse(exerciseJson) as ExerciseAuthoringBatchSpec;
      } catch {
        throw new Error(`CF5_OUTPUT_JSON_INVALID:${point.code}`);
      }

      const grammarValidation = this.validator.validateGrammarPointArtifact(
        grammar,
        `${point.code}.v${point.version}.json`,
      );
      if (!grammarValidation.valid || grammar.code !== point.code || grammar.version !== point.version) {
        throw new Error(`CF5_GRAMMAR_REVALIDATION_FAILED:${point.code}`);
      }
      const exerciseValidation = this.validator.validateExerciseBatchArtifact(
        exerciseBatch,
        `${point.code}.exercise-batch.json`,
      );
      if (
        !exerciseValidation.valid ||
        exerciseBatch.grammarPointCode !== point.code ||
        exerciseBatch.grammarPointVersion !== point.version ||
        exerciseBatch.grammarPointHash !== point.grammarHash ||
        exerciseBatch.exercises.length !== point.exerciseCount
      ) {
        throw new Error(`CF5_EXERCISE_REVALIDATION_FAILED:${point.code}`);
      }

      await this.assertPersistedEvidence({ runId, point });
      for (const relationCode of this.relationshipCodes(grammar)) {
        if (!manifestPoints.has(relationCode)) {
          throw new Error(`CF5_RELATIONSHIP_OUTSIDE_APPROVED_MANIFEST:${point.code}:${relationCode}`);
        }
      }
      prepared.push({ result: point, grammar, exerciseBatch });
    }
    return prepared;
  }

  private async assertPersistedEvidence(params: {
    runId: string;
    point: Cf4BatchReadinessReport['points'][number];
  }): Promise<void> {
    const point = params.point;
    const [grammarValidation, reviewJob, reviewRun, exerciseValidation] = await Promise.all([
      this.prisma.contentValidationRun.findUnique({ where: { id: point.grammarValidationRunId! } }),
      this.prisma.contentFactoryJob.findUnique({ where: { id: point.reviewJobId! } }),
      this.prisma.contentReviewRun.findUnique({ where: { id: point.reviewRunId! } }),
      this.prisma.contentValidationRun.findUnique({ where: { id: point.exerciseValidationRunId! } }),
    ]);
    if (
      !grammarValidation ||
      grammarValidation.runId !== params.runId ||
      !grammarValidation.passed ||
      grammarValidation.artifactHash !== point.grammarHash
    ) {
      throw new Error(`CF5_GRAMMAR_VALIDATION_EVIDENCE_FAILED:${point.code}`);
    }
    if (
      !reviewJob ||
      reviewJob.runId !== params.runId ||
      reviewJob.state !== 'READY_FOR_APPROVAL' ||
      reviewJob.inputHash !== point.grammarHash ||
      reviewJob.outputHash !== point.reviewReportHash ||
      !reviewRun ||
      reviewRun.runId !== params.runId ||
      reviewRun.jobId !== point.reviewJobId ||
      reviewRun.decision !== 'PASS' ||
      reviewRun.artifactHash !== point.grammarHash ||
      reviewRun.reportHash !== point.reviewReportHash
    ) {
      throw new Error(`CF5_REVIEW_EVIDENCE_FAILED:${point.code}`);
    }
    if (
      !exerciseValidation ||
      exerciseValidation.runId !== params.runId ||
      !exerciseValidation.passed ||
      exerciseValidation.artifactHash !== point.exerciseHash
    ) {
      throw new Error(`CF5_EXERCISE_VALIDATION_EVIDENCE_FAILED:${point.code}`);
    }
  }

  private async publishGrammarVersion(
    tx: Prisma.TransactionClient,
    grammarPointId: string,
    bundle: GrammarPointBundleSpec,
  ): Promise<string> {
    const contentHash = computeSha256(JSON.stringify(bundle));
    const existing = await tx.grammarPointVersion.findUnique({
      where: {
        grammarPointId_versionNo_locale: {
          grammarPointId,
          versionNo: bundle.version,
          locale: 'vi',
        },
      },
      select: { id: true, contentHash: true, status: true },
    });

    let versionId: string;
    if (existing) {
      if (existing.contentHash !== contentHash || existing.status === 'RETIRED') {
        throw new Error(`CF5_GRAMMAR_VERSION_IMMUTABILITY_CONFLICT:${bundle.code}:v${bundle.version}`);
      }
      versionId = existing.id;
      if (existing.status !== 'PUBLISHED') {
        await tx.grammarPointVersion.update({
          where: { id: existing.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      }
    } else {
      const created = await tx.grammarPointVersion.create({
        data: {
          grammarPointId,
          versionNo: bundle.version,
          cefrLevel: bundle.cefr,
          title: bundle.title,
          shortDescription: bundle.learningObjectiveVi,
          formSummary: bundle.form.patterns.join('\n'),
          meaningSummary: bundle.meaning.uses.join('\n'),
          usageNotes: bundle.usageConstraints.join('\n'),
          locale: 'vi',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          contentHash,
          learningObjectiveEn: bundle.learningObjectiveEn,
          provenanceJson: bundle.provenance as unknown as Prisma.InputJsonObject,
          generationPolicyJson: bundle.generationPolicy as unknown as Prisma.InputJsonObject,
          evaluationPolicyJson: bundle.evaluationPolicy as unknown as Prisma.InputJsonObject,
          rules: {
            create: bundle.rules.map((rule, priority) => ({
              ruleCode: rule.code,
              ruleType: rule.type,
              description: rule.description,
              priority,
            })),
          },
          examples: {
            create: bundle.examples.map((example, sortOrder) => ({
              exampleType: example.type,
              englishText: example.english,
              vietnameseText: example.vietnamese,
              explanation: example.explanationVi,
              sortOrder,
            })),
          },
          errorPatterns: {
            create: bundle.commonErrors.map((error) => ({
              errorCode: error.code,
              incorrectPattern: error.incorrect,
              correctedPattern: error.corrected,
              explanationVi: error.explanationVi,
              severity: error.severity,
            })),
          },
        },
        select: { id: true },
      });
      versionId = created.id;
    }

    await tx.grammarPoint.update({
      where: { id: grammarPointId },
      data: { status: 'PUBLISHED' },
    });
    return versionId;
  }

  private async publishExerciseBatch(
    tx: Prisma.TransactionClient,
    grammarPointVersionId: string,
    grammar: GrammarPointBundleSpec,
    batch: ExerciseAuthoringBatchSpec,
  ): Promise<number> {
    for (const exercise of batch.exercises) {
      await this.publishExercise(tx, grammarPointVersionId, grammar, batch, exercise);
    }
    return batch.exercises.length;
  }

  private async publishExercise(
    tx: Prisma.TransactionClient,
    grammarPointVersionId: string,
    grammar: GrammarPointBundleSpec,
    batch: ExerciseAuthoringBatchSpec,
    item: ExerciseItemSpec,
  ): Promise<void> {
    const existing = await tx.exercise.findUnique({
      where: { contentKey: item.contentKey },
      select: {
        id: true,
        origin: true,
        type: true,
        contentStatus: true,
        generatorVersion: true,
        evaluatorRubricVersion: true,
        difficulty: true,
        promptContextVi: true,
        instructionVi: true,
        semanticHash: true,
        topicCode: true,
        targets: { select: { grammarPointVersionId: true, targetRole: true } },
      },
    });
    if (existing) {
      const exactTarget = existing.targets.some(
        (target) =>
          target.grammarPointVersionId === grammarPointVersionId && target.targetRole === 'PRIMARY',
      );
      const exactFields =
        existing.origin === 'AI_GENERATED' &&
        existing.type === item.activityType &&
        existing.generatorVersion === batch.provenance.promptVersion &&
        existing.evaluatorRubricVersion === batch.policyVersion &&
        existing.difficulty === item.difficulty &&
        existing.promptContextVi === item.contextVi &&
        existing.instructionVi === item.instructionVi &&
        existing.semanticHash === item.semanticHash &&
        existing.topicCode === item.topicCode;
      if (!exactFields || !exactTarget || existing.contentStatus === 'RETIRED') {
        throw new Error(`CF5_EXERCISE_IMMUTABILITY_CONFLICT:${item.contentKey}`);
      }
      if (existing.contentStatus !== 'PUBLISHED') {
        await tx.exercise.update({
          where: { id: existing.id },
          data: { contentStatus: 'PUBLISHED' },
        });
      }
      return;
    }

    await tx.exercise.create({
      data: {
        contentKey: item.contentKey,
        origin: 'AI_GENERATED',
        type: item.activityType,
        contentStatus: 'PUBLISHED',
        generatorVersion: batch.provenance.promptVersion,
        evaluatorRubricVersion: batch.policyVersion,
        locale: 'vi',
        difficulty: item.difficulty,
        promptContextVi: item.contextVi,
        instructionVi: item.instructionVi,
        semanticHash: item.semanticHash,
        topicCode: item.topicCode,
        constraintsJson: {
          promptPayload: {
            activityType: item.activityType,
            variationGroup: item.variationGroup,
          },
          forbiddenMeaningChanges: item.forbiddenMeaningChanges,
          targetNecessity: item.targetNecessity,
          grammarPointCode: grammar.code,
          grammarPointVersion: grammar.version,
        } as Prisma.InputJsonObject,
        contentSnapshotJson: item as unknown as Prisma.InputJsonObject,
        targets: {
          create: {
            grammarPointVersionId,
            targetRole: 'PRIMARY',
          },
        },
        sentences: {
          create: {
            position: 0,
            sourceTextVi: item.instructionVi,
            referenceAnswersJson: item.allowedAnswers,
            semanticRequirementsJson: item.semanticRequirements,
          },
        },
      },
    });
  }

  private async upsertRelationships(
    tx: Prisma.TransactionClient,
    prepared: PreparedPoint[],
    identities: Map<string, { id: string; code: string }>,
    publishedVersions: Map<string, string>,
  ): Promise<void> {
    const groups = [
      ['prerequisites', 'PREREQUISITE'],
      ['buildsOn', 'BUILDS_ON'],
      ['contrastsWith', 'CONTRASTS_WITH'],
      ['oftenConfusedWith', 'OFTEN_CONFUSED_WITH'],
    ] as const;

    for (const item of prepared) {
      const source = identities.get(item.grammar.code);
      if (!source) throw new Error(`CF5_RELATIONSHIP_SOURCE_MISSING:${item.grammar.code}`);
      for (const [key, relationshipType] of groups) {
        for (const targetCode of item.grammar.relationships[key]) {
          const target = identities.get(targetCode);
          if (!target) throw new Error(`CF5_RELATIONSHIP_TARGET_MISSING:${targetCode}`);
          const targetPublished =
            publishedVersions.has(targetCode) ||
            Boolean(
              await tx.grammarPointVersion.findFirst({
                where: { grammarPointId: target.id, status: 'PUBLISHED' },
                select: { id: true },
              }),
            );
          await tx.grammarRelationship.upsert({
            where: {
              sourcePointId_targetPointId_relationshipType: {
                sourcePointId: source.id,
                targetPointId: target.id,
                relationshipType,
              },
            },
            create: {
              sourcePointId: source.id,
              targetPointId: target.id,
              relationshipType,
              status: targetPublished ? 'PUBLISHED' : 'DRAFT',
            },
            update: targetPublished ? { status: 'PUBLISHED' } : {},
          });
        }
      }
    }
  }

  private relationshipCodes(grammar: GrammarPointBundleSpec): string[] {
    return [
      ...grammar.relationships.prerequisites,
      ...grammar.relationships.buildsOn,
      ...grammar.relationships.contrastsWith,
      ...grammar.relationships.oftenConfusedWith,
    ];
  }

  private async readVerifiedJobOutput(
    runId: string,
    jobId: string,
    expectedHash: string,
  ): Promise<string> {
    const job = await this.prisma.contentFactoryJob.findUnique({
      where: { id: jobId },
      include: { artifacts: true },
    });
    if (!job || job.runId !== runId || job.state !== 'READY_FOR_APPROVAL' || job.outputHash !== expectedHash) {
      throw new Error(`CF5_OUTPUT_JOB_MISMATCH:${jobId}`);
    }
    const artifact = job.artifacts.find(
      (item) => item.artifactType === 'OUTPUT_SNAPSHOT' && item.contentHash === expectedHash,
    );
    const filename = artifact?.artifactPath.split('/').at(-1);
    if (!filename) throw new Error(`CF5_OUTPUT_ARTIFACT_MISSING:${jobId}`);
    const content = this.storage.readArtifact(runId, filename);
    if (!content || computeSha256(content) !== expectedHash) {
      throw new Error(`CF5_OUTPUT_ARTIFACT_HASH_MISMATCH:${jobId}`);
    }
    return content;
  }

  private async loadVerifiedReadinessReport(runId: string): Promise<Cf4BatchReadinessReport> {
    const artifact = await this.prisma.contentFactoryArtifact.findFirst({
      where: { runId, artifactType: 'CF4_BATCH_READINESS_REPORT' },
      orderBy: { createdAt: 'desc' },
    });
    const filename = artifact?.artifactPath.split('/').at(-1);
    if (!artifact || !filename) throw new Error('CF5_CF4_READINESS_REPORT_MISSING');
    const content = this.storage.readArtifact(runId, filename);
    if (!content || computeSha256(content) !== artifact.contentHash) {
      throw new Error('CF5_CF4_READINESS_REPORT_HASH_MISMATCH');
    }
    let report: Cf4BatchReadinessReport;
    try {
      report = JSON.parse(content) as Cf4BatchReadinessReport;
    } catch {
      throw new Error('CF5_CF4_READINESS_REPORT_JSON_INVALID');
    }
    if (report.phase !== 'CF4' || report.runId !== runId || report.status !== 'READY_FOR_APPROVAL') {
      throw new Error('CF5_CF4_READINESS_REPORT_NOT_APPROVABLE');
    }
    const metadata = artifact.metadataJson;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as Record<string, unknown>).batchCode !== report.batchCode
    ) {
      throw new Error('CF5_CF4_READINESS_REPORT_METADATA_MISMATCH');
    }
    return report;
  }

  private async loadApprovedManifest(manifestRunId: string): Promise<AutonomousManifest> {
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: manifestRunId } });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF5_REQUIRES_OWNER_APPROVED_MANIFEST');
    }
    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: manifestRunId, scopeHash: run.manifestHash },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval) throw new Error('CF5_MANIFEST_APPROVAL_EVIDENCE_MISSING');
    const job = await this.prisma.contentFactoryJob.findFirst({
      where: { runId: manifestRunId, purpose: 'PLAN_MANIFEST' },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' },
    });
    const input = job?.artifacts.find((artifact) => artifact.artifactType === 'INPUT_SNAPSHOT');
    const filename = input?.artifactPath.split('/').at(-1);
    if (!input || !filename) throw new Error('CF5_APPROVED_MANIFEST_ARTIFACT_MISSING');
    const content = this.storage.readArtifact(manifestRunId, filename);
    if (!content || computeSha256(content) !== input.contentHash) {
      throw new Error('CF5_APPROVED_MANIFEST_HASH_MISMATCH');
    }
    try {
      return JSON.parse(content) as AutonomousManifest;
    } catch {
      throw new Error('CF5_APPROVED_MANIFEST_JSON_INVALID');
    }
  }

  private indexManifestPoints(manifest: AutonomousManifest): Map<string, CurriculumPointSpec> {
    const points = new Map<string, CurriculumPointSpec>();
    for (const level of manifest.levels) {
      for (const unit of level.units) {
        for (const point of unit.points) {
          if (points.has(point.code)) throw new Error(`CF5_MANIFEST_DUPLICATE_CODE:${point.code}`);
          points.set(point.code, point);
        }
      }
    }
    return points;
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
