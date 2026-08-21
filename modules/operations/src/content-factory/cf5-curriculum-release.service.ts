import { Prisma, type PrismaClient } from '@prisma/client';
import type { AutonomousManifest } from './manifest-planner.js';
import {
  type Cf5ControlledPublicationResult,
  type Cf5PublishedPointResult,
} from './cf5-controlled-publication.service.js';
import { computeSha256 } from './idempotency-lease-manager.js';
import type { ContentFactoryStorageRepository } from './storage-repository.js';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Cefr = (typeof CEFR_ORDER)[number];

export interface Cf5CurriculumReleaseSpec {
  schemaVersion: '1.0';
  code: string;
  title: string;
  version: number;
  levels: Array<{
    code: string;
    cefr: Cefr;
    title: string;
    unlockPolicy: Record<string, unknown>;
    units: Array<{
      code: string;
      title: string;
      items: Array<{
        grammarPointCode: string;
        grammarPointVersion: number;
        role: 'REQUIRED';
        weight: number;
        minimumEvidenceCount: number;
      }>;
    }>;
  }>;
}

export interface Cf5RegressionFinding {
  code: string;
  severity: 'WARNING' | 'ERROR';
  message: string;
}

export interface Cf5LearnerFlowRegressionReport {
  schemaVersion: '1.0';
  phase: 'CF5';
  activeRelease: {
    id: string;
    code: string;
    version: number;
    contentHash: string;
    pointCount: number;
  };
  candidateRelease: {
    code: string;
    version: number;
    contentHash: string;
    pointCount: number;
  };
  retainedPointCount: number;
  addedPointCount: number;
  removedPointCount: number;
  versionChangeCount: number;
  activeEnrollmentCount: number;
  currentLevelMappingsVerified: number;
  minimumPublishedExercisesPerPoint: number;
  passed: boolean;
  findings: Cf5RegressionFinding[];
}

export interface Cf5ReleaseReadinessReport {
  schemaVersion: '1.0';
  phase: 'CF5';
  operation: 'PREPARE_CURRICULUM_RELEASE';
  runId: string;
  manifestRunId: string;
  releaseId: string | null;
  releaseCode: string;
  releaseVersion: number;
  releaseContentHash: string;
  scopeHash: string;
  status: 'READY_FOR_OWNER_APPROVAL' | 'DRAFT_ONLY';
  publicationBatchHashes: string[];
  regression: Cf5LearnerFlowRegressionReport;
  spec: Cf5CurriculumReleaseSpec;
  generatedAt: string;
}

export interface Cf5ReleaseActivationResult {
  schemaVersion: '1.0';
  phase: 'CF5';
  operation: 'ACTIVATE_CURRICULUM_RELEASE';
  runId: string;
  releaseId: string;
  releaseCode: string;
  releaseVersion: number;
  scopeHash: string;
  previousReleaseId: string | null;
  migratedEnrollmentCount: number;
  activatedAt: string;
}

interface PublishedPointRef extends Cf5PublishedPointResult {
  batchHash: string;
}

/**
 * CF5 creates an immutable candidate curriculum release, compares it with the
 * currently active release, verifies learner-flow migration, and requires a
 * separate human activation approval before switching the active release.
 */
export class Cf5CurriculumReleaseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ContentFactoryStorageRepository,
  ) {}

  public async prepareRelease(params: {
    runId: string;
    manifestRunId: string;
    minimumEvidenceCount?: number;
  }): Promise<Cf5ReleaseReadinessReport> {
    const existing = await this.loadReadinessReport(params.runId);
    if (existing) {
      if (existing.manifestRunId !== params.manifestRunId) {
        throw new Error('CF5_RELEASE_RUN_SCOPE_MISMATCH');
      }
      return existing;
    }

    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new Error('CF5_RELEASE_RUN_NOT_FOUND');
    if (!['DRAFT ONLY', 'DRAFT'].includes(run.status)) {
      throw new Error('CF5_RELEASE_RUN_NOT_DRAFT');
    }

    const manifest = await this.loadApprovedManifest(params.manifestRunId);
    const active = await this.loadActiveRelease();
    if (!active) throw new Error('CF5_ACTIVE_RELEASE_REQUIRED_FOR_REGRESSION');

    const publicationRefs = await this.loadPublishedPointRefs(params.manifestRunId);
    const minimumEvidenceCount = params.minimumEvidenceCount ?? 5;
    if (!Number.isSafeInteger(minimumEvidenceCount) || minimumEvidenceCount < 1) {
      throw new Error('CF5_MINIMUM_EVIDENCE_COUNT_INVALID');
    }

    const latestRelease = await this.prisma.curriculumRelease.findFirst({
      where: { curriculumId: active.curriculumId },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });
    const candidateVersion = (latestRelease?.versionNo ?? active.versionNo) + 1;
    const activeLevelByCefr = new Map(
      active.levels.map((level) => [level.cefrLevel as Cefr, level] as const),
    );

    const pointRefs = new Map<string, PublishedPointRef>();
    for (const [code, ref] of publicationRefs.entries()) {
      const dbVersion = await this.prisma.grammarPointVersion.findUnique({
        where: { id: ref.grammarPointVersionId },
        select: {
          id: true,
          versionNo: true,
          status: true,
          grammarPoint: { select: { code: true } },
        },
      });
      if (
        !dbVersion ||
        dbVersion.status !== 'PUBLISHED' ||
        dbVersion.grammarPoint.code !== code ||
        dbVersion.versionNo !== ref.version
      ) {
        throw new Error(`CF5_RELEASE_PUBLISHED_VERSION_MISMATCH:${code}`);
      }
      const exerciseCount = await this.prisma.exercise.count({
        where: {
          contentStatus: 'PUBLISHED',
          targets: {
            some: {
              grammarPointVersionId: ref.grammarPointVersionId,
              targetRole: 'PRIMARY',
            },
          },
        },
      });
      if (exerciseCount < ref.exerciseCount || exerciseCount < 12) {
        throw new Error(`CF5_RELEASE_EXERCISE_READINESS_FAILED:${code}`);
      }
      pointRefs.set(code, ref);
    }

    const spec: Cf5CurriculumReleaseSpec = {
      schemaVersion: '1.0',
      code: active.curriculum.code,
      title: active.curriculum.title,
      version: candidateVersion,
      levels: manifest.levels
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((level) => {
          const activeLevel = activeLevelByCefr.get(level.cefr);
          return {
            code: activeLevel?.code ?? `LEVEL_${level.cefr}_FULL`,
            cefr: level.cefr,
            title: activeLevel?.title ?? `Trình độ ${level.cefr}`,
            unlockPolicy: this.jsonObject(activeLevel?.unlockPolicyJson) ?? {
              requiredMasteryPercent: 80,
              minimumPointScore: 60,
            },
            units: level.units
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((unit) => ({
                code: unit.code,
                title: unit.titleVi,
                items: unit.points
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((point) => {
                    const ref = pointRefs.get(point.code);
                    if (!ref) throw new Error(`CF5_RELEASE_POINT_NOT_PUBLISHED:${point.code}`);
                    return {
                      grammarPointCode: point.code,
                      grammarPointVersion: ref.version,
                      role: 'REQUIRED' as const,
                      weight: 1,
                      minimumEvidenceCount,
                    };
                  }),
              })),
          };
        }),
    };

    this.assertReleaseShape(spec);
    const releaseContentHash = computeSha256(JSON.stringify(spec));
    const regression = await this.runLearnerFlowRegression({
      active,
      spec,
      pointRefs,
      releaseContentHash,
    });
    const publicationBatchHashes = [...new Set([...pointRefs.values()].map((ref) => ref.batchHash))].sort();
    const scopeHash = computeSha256(
      JSON.stringify({
        schemaVersion: '1.0',
        phase: 'CF5',
        operation: 'ACTIVATE_CURRICULUM_RELEASE',
        runId: params.runId,
        manifestRunId: params.manifestRunId,
        activeReleaseId: active.id,
        activeReleaseContentHash: active.contentHash,
        releaseCode: spec.code,
        releaseVersion: spec.version,
        releaseContentHash,
        regressionHash: computeSha256(JSON.stringify(regression)),
        publicationBatchHashes,
      }),
    );

    let releaseId: string | null = null;
    if (regression.passed) {
      releaseId = await this.createCandidateRelease({
        curriculumId: active.curriculumId,
        spec,
        contentHash: releaseContentHash,
        pointRefs,
      });
    }

    const report: Cf5ReleaseReadinessReport = {
      schemaVersion: '1.0',
      phase: 'CF5',
      operation: 'PREPARE_CURRICULUM_RELEASE',
      runId: params.runId,
      manifestRunId: params.manifestRunId,
      releaseId,
      releaseCode: spec.code,
      releaseVersion: spec.version,
      releaseContentHash,
      scopeHash,
      status: regression.passed ? 'READY_FOR_OWNER_APPROVAL' : 'DRAFT_ONLY',
      publicationBatchHashes,
      regression,
      spec,
      generatedAt: run.createdAt.toISOString(),
    };
    await this.persistReadinessReport(report);
    if (regression.passed) {
      await this.prisma.contentFactoryRun.update({
        where: { id: params.runId },
        data: { status: 'READY FOR OWNER APPROVAL', manifestHash: scopeHash },
      });
    }
    return report;
  }

  /** Human-only command boundary; automated agents must not synthesize this decision. */
  public async recordActivationApproval(params: {
    runId: string;
    expectedScopeHash: string;
    approvedBy: string;
    rationale: string;
    confirmation: string;
  }) {
    const report = await this.requireReadyReport(params.runId, params.expectedScopeHash);
    if (params.confirmation !== `APPROVE_RELEASE:${report.scopeHash}`) {
      throw new Error('CF5_RELEASE_APPROVAL_CONFIRMATION_MISMATCH');
    }
    const approvedBy = params.approvedBy.trim();
    const rationale = params.rationale.trim();
    if (!approvedBy || !rationale) {
      throw new Error('CF5_RELEASE_APPROVAL_IDENTITY_AND_RATIONALE_REQUIRED');
    }
    const requestHash = computeSha256(
      JSON.stringify({
        runId: params.runId,
        expectedScopeHash: params.expectedScopeHash,
        approvedBy,
        rationale,
        confirmation: params.confirmation,
      }),
    );
    const approvalHash = computeSha256(
      `${params.runId}:${approvedBy}:${report.scopeHash}:${rationale}`,
    );
    const existing = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: params.runId, scopeHash: report.scopeHash },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error('CF5_RELEASE_APPROVAL_ALREADY_RECORDED');
      return existing;
    }

    try {
      const approval = await this.prisma.contentFactoryApproval.create({
        data: {
          runId: params.runId,
          approvedBy,
          scopeHash: report.scopeHash,
          approvalHash,
          rationale,
          requestHash,
          decisionSource: 'OWNER_CLI',
        },
      });
      await this.prisma.contentFactoryRun.update({
        where: { id: params.runId },
        data: { status: 'OWNER APPROVED', manifestHash: report.scopeHash },
      });
      return approval;
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code !== 'P2002') throw error;
      const concurrent = await this.prisma.contentFactoryApproval.findFirst({
        where: { runId: params.runId, scopeHash: report.scopeHash },
      });
      if (!concurrent || concurrent.requestHash !== requestHash) {
        throw new Error('CF5_RELEASE_APPROVAL_ALREADY_RECORDED');
      }
      return concurrent;
    }
  }

  /** Explicit activation after a separate owner approval. */
  public async activateRelease(params: {
    runId: string;
    expectedScopeHash: string;
    confirmation: string;
  }): Promise<Cf5ReleaseActivationResult> {
    if (params.confirmation !== `ACTIVATE:${params.expectedScopeHash}`) {
      throw new Error('CF5_RELEASE_ACTIVATION_CONFIRMATION_MISMATCH');
    }
    const report = await this.loadReadinessReport(params.runId);
    if (!report || report.scopeHash !== params.expectedScopeHash || !report.releaseId) {
      throw new Error('CF5_RELEASE_ACTIVATION_SCOPE_MISMATCH');
    }
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: params.runId } });
    if (!run || run.status !== 'OWNER APPROVED' || run.manifestHash !== report.scopeHash) {
      throw new Error('CF5_RELEASE_ACTIVATION_REQUIRES_OWNER_APPROVAL');
    }
    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: params.runId, scopeHash: report.scopeHash },
    });
    if (!approval) throw new Error('CF5_RELEASE_ACTIVATION_APPROVAL_EVIDENCE_MISSING');

    const existingPublication = await this.prisma.contentPublication.findUnique({
      where: { batchHash: report.scopeHash },
    });
    if (existingPublication) {
      if (
        existingPublication.runId !== params.runId ||
        existingPublication.approvalId !== approval.id ||
        existingPublication.releaseId !== report.releaseId ||
        existingPublication.status !== 'RELEASE_ACTIVE'
      ) {
        throw new Error('CF5_RELEASE_ACTIVATION_IDEMPOTENCY_CONFLICT');
      }
      return existingPublication.resultJson as unknown as Cf5ReleaseActivationResult;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const concurrent = await tx.contentPublication.findUnique({
          where: { batchHash: report.scopeHash },
        });
        if (concurrent) {
          if (
            concurrent.runId !== params.runId ||
            concurrent.approvalId !== approval.id ||
            concurrent.releaseId !== report.releaseId ||
            concurrent.status !== 'RELEASE_ACTIVE'
          ) {
            throw new Error('CF5_RELEASE_ACTIVATION_IDEMPOTENCY_CONFLICT');
          }
          return concurrent.resultJson as unknown as Cf5ReleaseActivationResult;
        }

        const candidate = await tx.curriculumRelease.findUnique({
          where: { id: report.releaseId! },
          select: {
            id: true,
            curriculumId: true,
            versionNo: true,
            status: true,
            contentHash: true,
            levels: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, cefrLevel: true, sortOrder: true },
            },
          },
        });
        if (
          !candidate ||
          candidate.contentHash !== report.releaseContentHash ||
          candidate.versionNo !== report.releaseVersion ||
          !['DRAFT', 'IN_REVIEW', 'PUBLISHED'].includes(candidate.status)
        ) {
          throw new Error('CF5_RELEASE_CANDIDATE_CHANGED_AFTER_APPROVAL');
        }

        const previous = await tx.curriculumRelease.findFirst({
          where: {
            curriculumId: candidate.curriculumId,
            status: 'PUBLISHED',
            id: { not: candidate.id },
          },
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            enrollments: {
              select: {
                userId: true,
                currentLevel: { select: { cefrLevel: true } },
              },
            },
          },
        });

        const levelByCefr = new Map(candidate.levels.map((level) => [level.cefrLevel, level] as const));
        const firstLevel = candidate.levels[0];
        if (!firstLevel) throw new Error('CF5_RELEASE_CANDIDATE_HAS_NO_LEVELS');
        let migratedEnrollmentCount = 0;
        if (previous) {
          for (const enrollment of previous.enrollments) {
            const targetLevel =
              (enrollment.currentLevel
                ? levelByCefr.get(enrollment.currentLevel.cefrLevel)
                : undefined) ?? firstLevel;
            await tx.userCurriculumEnrollment.upsert({
              where: {
                userId_releaseId: {
                  userId: enrollment.userId,
                  releaseId: candidate.id,
                },
              },
              create: {
                userId: enrollment.userId,
                releaseId: candidate.id,
                currentLevelId: targetLevel.id,
                status: 'ACTIVE',
              },
              update: {
                currentLevelId: targetLevel.id,
                status: 'ACTIVE',
                completedAt: null,
              },
            });

            const oldProgress = await tx.levelProgress.findFirst({
              where: {
                userId: enrollment.userId,
                curriculumLevel: {
                  releaseId: previous.id,
                  cefrLevel: targetLevel.cefrLevel,
                },
              },
              select: { progressScore: true, unlockedAt: true },
            });
            await tx.levelProgress.upsert({
              where: {
                userId_curriculumLevelId: {
                  userId: enrollment.userId,
                  curriculumLevelId: targetLevel.id,
                },
              },
              create: {
                userId: enrollment.userId,
                curriculumLevelId: targetLevel.id,
                status: 'IN_PROGRESS',
                progressScore: oldProgress?.progressScore ?? 0,
                policyVersion: 'cf5-release-migration-v1',
                unlockedAt: oldProgress?.unlockedAt ?? new Date(),
              },
              update: {
                status: 'IN_PROGRESS',
                progressScore: oldProgress?.progressScore ?? 0,
                policyVersion: 'cf5-release-migration-v1',
                unlockedAt: oldProgress?.unlockedAt ?? new Date(),
                completedAt: null,
              },
            });
            migratedEnrollmentCount += 1;
          }
        }

        if (candidate.status !== 'PUBLISHED') {
          await tx.curriculumRelease.updateMany({
            where: { curriculumId: candidate.curriculumId, status: 'PUBLISHED' },
            data: { status: 'RETIRED' },
          });
          await tx.curriculumRelease.update({
            where: { id: candidate.id },
            data: { status: 'PUBLISHED', publishedAt: new Date() },
          });
          await tx.curriculum.update({
            where: { id: candidate.curriculumId },
            data: { status: 'PUBLISHED' },
          });
        }

        const activatedAt = new Date();
        const result: Cf5ReleaseActivationResult = {
          schemaVersion: '1.0',
          phase: 'CF5',
          operation: 'ACTIVATE_CURRICULUM_RELEASE',
          runId: params.runId,
          releaseId: candidate.id,
          releaseCode: report.releaseCode,
          releaseVersion: report.releaseVersion,
          scopeHash: report.scopeHash,
          previousReleaseId: previous?.id ?? null,
          migratedEnrollmentCount,
          activatedAt: activatedAt.toISOString(),
        };
        await tx.contentPublication.create({
          data: {
            runId: params.runId,
            approvalId: approval.id,
            batchHash: report.scopeHash,
            status: 'RELEASE_ACTIVE',
            releaseId: candidate.id,
            resultJson: result as unknown as Prisma.InputJsonObject,
            publishedAt: activatedAt,
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async createCandidateRelease(params: {
    curriculumId: string;
    spec: Cf5CurriculumReleaseSpec;
    contentHash: string;
    pointRefs: Map<string, PublishedPointRef>;
  }): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.curriculumRelease.findUnique({
          where: {
            curriculumId_versionNo: {
              curriculumId: params.curriculumId,
              versionNo: params.spec.version,
            },
          },
          select: { id: true, contentHash: true, status: true },
        });
        if (existing) {
          if (existing.contentHash !== params.contentHash || existing.status === 'PUBLISHED') {
            throw new Error('CF5_RELEASE_VERSION_CONFLICT');
          }
          return existing.id;
        }

        const release = await tx.curriculumRelease.create({
          data: {
            curriculumId: params.curriculumId,
            versionNo: params.spec.version,
            status: 'DRAFT',
            contentHash: params.contentHash,
            levels: {
              create: params.spec.levels.map((level, levelOrder) => ({
                code: level.code,
                cefrLevel: level.cefr,
                title: level.title,
                sortOrder: levelOrder,
                unlockPolicyJson: level.unlockPolicy as Prisma.InputJsonObject,
                units: {
                  create: level.units.map((unit, unitOrder) => ({
                    code: unit.code,
                    title: unit.title,
                    sortOrder: unitOrder,
                    items: {
                      create: unit.items.map((item, itemOrder) => {
                        const ref = params.pointRefs.get(item.grammarPointCode);
                        if (!ref) throw new Error(`CF5_RELEASE_POINT_REF_MISSING:${item.grammarPointCode}`);
                        return {
                          grammarPointVersionId: ref.grammarPointVersionId,
                          role: item.role,
                          sortOrder: itemOrder,
                          weight: item.weight,
                          minimumEvidenceCount: item.minimumEvidenceCount,
                        };
                      }),
                    },
                  })),
                },
              })),
            },
          },
          select: { id: true },
        });
        return release.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async runLearnerFlowRegression(params: {
    active: Awaited<ReturnType<Cf5CurriculumReleaseService['loadActiveRelease']>> extends infer T
      ? NonNullable<T>
      : never;
    spec: Cf5CurriculumReleaseSpec;
    pointRefs: Map<string, PublishedPointRef>;
    releaseContentHash: string;
  }): Promise<Cf5LearnerFlowRegressionReport> {
    const findings: Cf5RegressionFinding[] = [];
    const activeItems = params.active.levels.flatMap((level) =>
      level.units.flatMap((unit) =>
        unit.items.map((item) => ({
          code: item.grammarPointVersion.grammarPoint.code,
          version: item.grammarPointVersion.versionNo,
        })),
      ),
    );
    const candidateItems = params.spec.levels.flatMap((level) =>
      level.units.flatMap((unit) =>
        unit.items.map((item) => ({
          code: item.grammarPointCode,
          version: item.grammarPointVersion,
        })),
      ),
    );
    const activeByCode = new Map(activeItems.map((item) => [item.code, item.version]));
    const candidateByCode = new Map(candidateItems.map((item) => [item.code, item.version]));
    if (candidateByCode.size !== candidateItems.length) {
      findings.push({
        code: 'CF5_RELEASE_DUPLICATE_POINT_CODE',
        severity: 'ERROR',
        message: 'Candidate release contains duplicate grammar point codes.',
      });
    }

    const removed = [...activeByCode.keys()].filter((code) => !candidateByCode.has(code));
    for (const code of removed) {
      findings.push({
        code: 'CF5_RELEASE_REMOVES_ACTIVE_POINT',
        severity: 'ERROR',
        message: `Active grammar point ${code} would disappear from the new release.`,
      });
    }

    let versionChangeCount = 0;
    for (const [code, oldVersion] of activeByCode.entries()) {
      const nextVersion = candidateByCode.get(code);
      if (nextVersion === undefined) continue;
      if (nextVersion < oldVersion) {
        findings.push({
          code: 'CF5_RELEASE_VERSION_REGRESSION',
          severity: 'ERROR',
          message: `${code} would regress from v${oldVersion} to v${nextVersion}.`,
        });
      }
      if (nextVersion !== oldVersion) versionChangeCount += 1;
    }

    const candidateCefr = params.spec.levels.map((level) => level.cefr);
    const expectedCefr = CEFR_ORDER.filter((cefr) => candidateCefr.includes(cefr));
    if (candidateCefr.join('|') !== expectedCefr.join('|')) {
      findings.push({
        code: 'CF5_RELEASE_LEVEL_ORDER_INVALID',
        severity: 'ERROR',
        message: 'Candidate CEFR levels are not ordered monotonically from A1 to C2.',
      });
    }

    let minimumPublishedExercisesPerPoint = Number.POSITIVE_INFINITY;
    for (const item of candidateItems) {
      const ref = params.pointRefs.get(item.code);
      if (!ref) {
        findings.push({
          code: 'CF5_RELEASE_POINT_WITHOUT_CONTROLLED_PUBLICATION',
          severity: 'ERROR',
          message: `${item.code} is not backed by controlled publication evidence.`,
        });
        continue;
      }
      minimumPublishedExercisesPerPoint = Math.min(
        minimumPublishedExercisesPerPoint,
        ref.exerciseCount,
      );
      if (ref.exerciseCount < 12) {
        findings.push({
          code: 'CF5_RELEASE_EXERCISE_MINIMUM_NOT_MET',
          severity: 'ERROR',
          message: `${item.code} has only ${ref.exerciseCount} published exercises.`,
        });
      }
    }

    const activeEnrollments = await this.prisma.userCurriculumEnrollment.findMany({
      where: { releaseId: params.active.id },
      select: {
        userId: true,
        currentLevel: { select: { cefrLevel: true } },
      },
    });
    const candidateLevels = new Set(params.spec.levels.map((level) => level.cefr));
    let currentLevelMappingsVerified = 0;
    for (const enrollment of activeEnrollments) {
      const cefr = enrollment.currentLevel?.cefrLevel as Cefr | undefined;
      if (!cefr || candidateLevels.has(cefr)) {
        currentLevelMappingsVerified += 1;
      } else {
        findings.push({
          code: 'CF5_RELEASE_ENROLLMENT_LEVEL_UNMAPPABLE',
          severity: 'ERROR',
          message: `User ${enrollment.userId} is on ${cefr}, which has no candidate level.`,
        });
      }
    }

    const retainedPointCount = [...activeByCode.keys()].filter((code) => candidateByCode.has(code)).length;
    const addedPointCount = [...candidateByCode.keys()].filter((code) => !activeByCode.has(code)).length;
    return {
      schemaVersion: '1.0',
      phase: 'CF5',
      activeRelease: {
        id: params.active.id,
        code: params.active.curriculum.code,
        version: params.active.versionNo,
        contentHash: params.active.contentHash,
        pointCount: activeByCode.size,
      },
      candidateRelease: {
        code: params.spec.code,
        version: params.spec.version,
        contentHash: params.releaseContentHash,
        pointCount: candidateByCode.size,
      },
      retainedPointCount,
      addedPointCount,
      removedPointCount: removed.length,
      versionChangeCount,
      activeEnrollmentCount: activeEnrollments.length,
      currentLevelMappingsVerified,
      minimumPublishedExercisesPerPoint:
        minimumPublishedExercisesPerPoint === Number.POSITIVE_INFINITY
          ? 0
          : minimumPublishedExercisesPerPoint,
      passed: findings.every((finding) => finding.severity !== 'ERROR'),
      findings,
    };
  }

  private async loadPublishedPointRefs(
    manifestRunId: string,
  ): Promise<Map<string, PublishedPointRef>> {
    const publications = await this.prisma.contentPublication.findMany({
      where: { status: 'PUBLISHED' },
      select: { batchHash: true, resultJson: true },
    });
    const refs = new Map<string, PublishedPointRef>();
    for (const publication of publications) {
      const result = publication.resultJson as unknown as Partial<Cf5ControlledPublicationResult>;
      if (
        result.schemaVersion !== '1.0' ||
        result.phase !== 'CF5' ||
        result.operation !== 'PUBLISH_APPROVED_CF4_BATCH' ||
        result.manifestRunId !== manifestRunId ||
        !Array.isArray(result.points)
      ) {
        continue;
      }
      for (const point of result.points) {
        if (
          !point ||
          typeof point.code !== 'string' ||
          typeof point.version !== 'number' ||
          typeof point.grammarPointVersionId !== 'string' ||
          typeof point.exerciseCount !== 'number'
        ) {
          throw new Error('CF5_PUBLICATION_RESULT_SCHEMA_INVALID');
        }
        const existing = refs.get(point.code);
        const next: PublishedPointRef = { ...point, batchHash: publication.batchHash };
        if (
          existing &&
          (existing.version !== next.version ||
            existing.grammarPointVersionId !== next.grammarPointVersionId)
        ) {
          throw new Error(`CF5_PUBLICATION_POINT_CONFLICT:${point.code}`);
        }
        refs.set(point.code, next);
      }
    }
    return refs;
  }

  private async loadActiveRelease() {
    return this.prisma.curriculumRelease.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        curriculumId: true,
        versionNo: true,
        contentHash: true,
        curriculum: { select: { code: true, title: true } },
        levels: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            code: true,
            cefrLevel: true,
            title: true,
            unlockPolicyJson: true,
            units: {
              orderBy: { sortOrder: 'asc' },
              select: {
                code: true,
                items: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    grammarPointVersion: {
                      select: {
                        versionNo: true,
                        grammarPoint: { select: { code: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async loadApprovedManifest(manifestRunId: string): Promise<AutonomousManifest> {
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: manifestRunId } });
    if (!run || run.status !== 'OWNER APPROVED' || !run.manifestHash) {
      throw new Error('CF5_RELEASE_REQUIRES_OWNER_APPROVED_MANIFEST');
    }
    const approval = await this.prisma.contentFactoryApproval.findFirst({
      where: { runId: manifestRunId, scopeHash: run.manifestHash },
    });
    if (!approval) throw new Error('CF5_RELEASE_MANIFEST_APPROVAL_EVIDENCE_MISSING');
    const job = await this.prisma.contentFactoryJob.findFirst({
      where: { runId: manifestRunId, purpose: 'PLAN_MANIFEST' },
      include: { artifacts: true },
      orderBy: { createdAt: 'desc' },
    });
    const artifact = job?.artifacts.find((item) => item.artifactType === 'INPUT_SNAPSHOT');
    const filename = artifact?.artifactPath.split('/').at(-1);
    if (!artifact || !filename) throw new Error('CF5_RELEASE_MANIFEST_ARTIFACT_MISSING');
    const content = this.storage.readArtifact(manifestRunId, filename);
    if (!content || computeSha256(content) !== artifact.contentHash) {
      throw new Error('CF5_RELEASE_MANIFEST_HASH_MISMATCH');
    }
    try {
      return JSON.parse(content) as AutonomousManifest;
    } catch {
      throw new Error('CF5_RELEASE_MANIFEST_JSON_INVALID');
    }
  }

  private async persistReadinessReport(report: Cf5ReleaseReadinessReport): Promise<void> {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const hash = computeSha256(content);
    const filename = `cf5_release_${report.releaseCode.toLowerCase()}_v${report.releaseVersion}_${hash.slice(0, 12)}.json`;
    const stored = this.storage.saveArtifact(report.runId, filename, content);
    const existing = await this.prisma.contentFactoryArtifact.findFirst({
      where: {
        runId: report.runId,
        artifactType: 'CF5_RELEASE_READINESS_REPORT',
        contentHash: stored.contentHash,
      },
    });
    if (!existing) {
      await this.prisma.contentFactoryArtifact.create({
        data: {
          runId: report.runId,
          artifactPath: stored.artifactPath,
          artifactType: 'CF5_RELEASE_READINESS_REPORT',
          contentHash: stored.contentHash,
          storageUri: stored.storageUri,
          metadataJson: {
            phase: 'CF5',
            operation: report.operation,
            releaseId: report.releaseId,
            releaseCode: report.releaseCode,
            releaseVersion: report.releaseVersion,
            scopeHash: report.scopeHash,
            status: report.status,
          },
        },
      });
    }
  }

  private async loadReadinessReport(runId: string): Promise<Cf5ReleaseReadinessReport | null> {
    const artifact = await this.prisma.contentFactoryArtifact.findFirst({
      where: { runId, artifactType: 'CF5_RELEASE_READINESS_REPORT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!artifact) return null;
    const filename = artifact.artifactPath.split('/').at(-1);
    if (!filename) throw new Error('CF5_RELEASE_READINESS_ARTIFACT_PATH_INVALID');
    const content = this.storage.readArtifact(runId, filename);
    if (!content || computeSha256(content) !== artifact.contentHash) {
      throw new Error('CF5_RELEASE_READINESS_ARTIFACT_HASH_MISMATCH');
    }
    try {
      const report = JSON.parse(content) as Cf5ReleaseReadinessReport;
      if (report.phase !== 'CF5' || report.runId !== runId) {
        throw new Error('CF5_RELEASE_READINESS_REPORT_SCOPE_INVALID');
      }
      return report;
    } catch (error) {
      if (error instanceof Error && error.message === 'CF5_RELEASE_READINESS_REPORT_SCOPE_INVALID') {
        throw error;
      }
      throw new Error('CF5_RELEASE_READINESS_REPORT_JSON_INVALID');
    }
  }

  private async requireReadyReport(
    runId: string,
    expectedScopeHash: string,
  ): Promise<Cf5ReleaseReadinessReport> {
    const report = await this.loadReadinessReport(runId);
    const run = await this.prisma.contentFactoryRun.findUnique({ where: { id: runId } });
    if (
      !report ||
      report.status !== 'READY_FOR_OWNER_APPROVAL' ||
      !report.releaseId ||
      report.scopeHash !== expectedScopeHash ||
      !run ||
      run.status !== 'READY FOR OWNER APPROVAL' ||
      run.manifestHash !== expectedScopeHash
    ) {
      throw new Error('CF5_RELEASE_NOT_READY_FOR_OWNER_APPROVAL');
    }
    return report;
  }

  private assertReleaseShape(spec: Cf5CurriculumReleaseSpec): void {
    if (spec.levels.length === 0) throw new Error('CF5_RELEASE_HAS_NO_LEVELS');
    const codes = new Set<string>();
    for (const level of spec.levels) {
      if (level.units.length === 0) throw new Error(`CF5_RELEASE_LEVEL_HAS_NO_UNITS:${level.cefr}`);
      for (const unit of level.units) {
        if (unit.items.length === 0) throw new Error(`CF5_RELEASE_UNIT_HAS_NO_ITEMS:${unit.code}`);
        for (const item of unit.items) {
          if (codes.has(item.grammarPointCode)) {
            throw new Error(`CF5_RELEASE_DUPLICATE_POINT:${item.grammarPointCode}`);
          }
          codes.add(item.grammarPointCode);
        }
      }
    }
  }

  private jsonObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }
}
