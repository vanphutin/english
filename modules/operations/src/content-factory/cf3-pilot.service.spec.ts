import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import type { Cf3ManifestApprovalGate } from './cf3-manifest-approval-gate.js';
import { Cf3PilotService } from './cf3-pilot.service.js';
import { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import { ExerciseFactory, type ExercisePreflightPort } from './exercise-factory.js';
import { IndependentContentReviewer } from './independent-reviewer.js';
import { LessonGenerator, type PilotGrammarTarget } from './lesson-generator.js';
import { ContentReviewRunRepository } from './review-run-repository.js';
import { ContentFactoryStorageRepository } from './storage-repository.js';
import { ContentValidationRunRepository } from './validation-run-repository.js';

const prisma = new PrismaClient();
const storageDir = path.resolve(__dirname, '../../../../var/test-cf3-pilot');
const manifestRunId = '22222222-2222-4222-8222-222222222222';

function target(code: string, sortOrder: number): PilotGrammarTarget {
  return {
    code,
    family: 'BE_VERB',
    canonicalSlug: code.toLowerCase().replaceAll('_', '-'),
    titleVi: `Chủ điểm ${code}`,
    titleEn: `Grammar point ${code}`,
    assessableDistinction: 'Learner selects the correct present form of be for the subject.',
    communicativeFunctions: ['introduce people'],
    formBoundary: 'Use am, is, or are with an explicit subject.',
    meaningBoundary: 'Describe identity or a current state with present be.',
    useBoundary: 'Do not use do-support with the main verb be.',
    prerequisites: [],
    buildsOn: [],
    contrastsWith: [],
    oftenConfusedWith: [],
    vocabularyDomains: ['PEOPLE'],
    rationale: 'A bounded A1 distinction that can be assessed independently.',
    sortOrder,
    cefr: 'A1',
  };
}

class FakeManifestGate implements Cf3ManifestApprovalGate {
  public calls = 0;

  async assertApprovedTargets(params: { manifestRunId: string; targets: PilotGrammarTarget[] }) {
    this.calls += 1;
    expect(params.manifestRunId).toBe(manifestRunId);
    expect(params.targets.length).toBeGreaterThanOrEqual(3);
  }
}

class FakeGrammarAuthor implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'author-model';
  public calls = 0;

  async generateJson(request: Parameters<ContentFactoryJsonProvider['generateJson']>[0]) {
    this.calls += 1;
    const input = JSON.parse(request.input) as { manifestItem: PilotGrammarTarget };
    const point = input.manifestItem;
    return {
      code: 'UNTRUSTED_CODE',
      family: point.family,
      title: point.titleVi,
      learningObjectiveVi: 'Dùng đúng động từ be ở hiện tại trong câu giới thiệu đơn giản.',
      learningObjectiveEn: 'Use the correct present form of be in simple introductions.',
      form: {
        patterns: ['I + am + complement', 'You/We/They + are + complement'],
        morphologyNotes: ['Use is with he, she, and it.'],
      },
      meaning: { uses: ['Identify a person.', 'Describe a simple present state.'] },
      usageConstraints: ['Choose the form of be from the grammatical subject.'],
      relationships: {
        prerequisites: ['UNTRUSTED'],
        buildsOn: [],
        contrastsWith: [],
        oftenConfusedWith: [],
      },
      rules: [
        {
          code: `${point.code}_FORM`,
          type: 'FORM',
          description: 'Use am with I, is with singular third person, and are otherwise.',
        },
      ],
      examples: [
        {
          type: 'AFFIRMATIVE',
          english: 'I am a student.',
          vietnamese: 'Tôi là một học sinh.',
          explanationVi: 'Chủ ngữ I đi với am.',
        },
        {
          type: 'NEGATIVE',
          english: 'She is not tired.',
          vietnamese: 'Cô ấy không mệt.',
          explanationVi: 'Đặt not sau is để tạo câu phủ định.',
        },
        {
          type: 'QUESTION',
          english: 'Are you ready?',
          vietnamese: 'Bạn đã sẵn sàng chưa?',
          explanationVi: 'Đưa are lên trước chủ ngữ you để tạo câu hỏi.',
        },
      ],
      commonErrors: Array.from({ length: 3 }, (_, index) => ({
        code: `${point.code}_ERR_${index + 1}`,
        incorrect: [`I is ready.`, `She are ready.`, `They is ready.`][index],
        corrected: [`I am ready.`, `She is ready.`, `They are ready.`][index],
        explanationVi: `Lỗi số ${index + 1} dùng sai dạng be theo chủ ngữ.`,
        severity: 'MAJOR',
      })),
      generationPolicy: { allowedContexts: ['PEOPLE'], requireExplicitTarget: true },
      evaluationPolicy: {
        mustCheck: ['subject-be agreement'],
        referenceAnswersAreNonExhaustive: true,
      },
      provenance: {
        origin: 'AI_GENERATED',
        provider: 'UNTRUSTED',
        model: 'UNTRUSTED',
        promptVersion: 'UNTRUSTED',
        generatedAt: '2020-01-01T00:00:00.000Z',
      },
      license: 'PUBLIC_CONTENT',
    };
  }
}

class FakeReviewer implements ContentFactoryJsonProvider {
  public readonly provider = 'SECONDARY_OPENAI_COMPATIBLE' as const;
  public readonly model = 'review-model';
  public calls = 0;

  constructor(private readonly lowScoreCode?: string) {}

  async generateJson(request: Parameters<ContentFactoryJsonProvider['generateJson']>[0]) {
    this.calls += 1;
    const input = JSON.parse(request.input) as { artifact: { code: string } };
    const low = input.artifact.code === this.lowScoreCode;
    return {
      decision: 'PASS',
      confidence: 0.95,
      scores: {
        correctness: low ? 20 : 30,
        specificity: 14,
        examples: 14,
        vietnamesePedagogy: 10,
        cefrFit: 10,
        evaluatorReadiness: low ? 6 : 10,
        originalityDiversity: 4,
        provenanceCompleteness: 4,
        total: low ? 78 : 96,
      },
      findings: [],
    };
  }
}

const activityTypes = [
  'TRANSLATE_CONTEXT',
  'CORRECT_ERROR',
  'TRANSFORM_SENTENCE',
  'COMPLETE_SENTENCE',
] as const;

class FakeExerciseAuthor implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'exercise-model';
  public calls = 0;

  async generateJson(request: Parameters<ContentFactoryJsonProvider['generateJson']>[0]) {
    this.calls += 1;
    const input = JSON.parse(request.input) as { grammarPoint: { code: string } };
    const code = input.grammarPoint.code;
    return {
      exercises: Array.from({ length: 12 }, (_, index) => ({
        contentKey: `${code}-exercise-${index + 1}`,
        activityType: activityTypes[index % activityTypes.length],
        topicCode: `TOPIC_${(index % 6) + 1}`,
        contextVi: `Ngữ cảnh số ${index + 1} cho chủ điểm ${code}.`,
        instructionVi: `Hoàn thành nhiệm vụ số ${index + 1} bằng cấu trúc mục tiêu.`,
        targetNecessity: 'Câu trả lời phải dùng đúng dạng be phù hợp với chủ ngữ đã cho.',
        semanticRequirements: ['Giữ nguyên chủ thể và ý nghĩa nhận diện.'],
        allowedAnswers: [`I am ready in context ${index + 1}.`],
        forbiddenMeaningChanges: ['Không đổi chủ thể.'],
        hints: ['Xác định chủ ngữ trước khi chọn dạng động từ.'],
        variationGroup: `variation-${index % 3}`,
        semanticHash: createHash('sha256').update(`${code}:${index}`).digest('hex'),
        difficulty: (index % 3) + 1,
        validationNotes: [],
      })),
    };
  }
}

class PassingPreflight implements ExercisePreflightPort {
  public calls = 0;

  async evaluate() {
    this.calls += 1;
    return {
      targetNecessityPassed: true,
      ambiguityPassed: true,
      evaluatorPassed: true,
      findingCodes: [],
    };
  }
}

describe('Cf3PilotService', () => {
  let runId: string;
  let manifestGate: FakeManifestGate;
  let grammarProvider: FakeGrammarAuthor;
  let reviewerProvider: FakeReviewer;
  let exerciseProvider: FakeExerciseAuthor;
  let preflight: PassingPreflight;
  let service: Cf3PilotService;

  beforeEach(async () => {
    const orchestrator = new ContentFactoryOrchestratorService(prisma, storageDir);
    const run = await orchestrator.startRun({ maxRequests: 100 });
    runId = run.id;
    manifestGate = new FakeManifestGate();
    grammarProvider = new FakeGrammarAuthor();
    reviewerProvider = new FakeReviewer();
    exerciseProvider = new FakeExerciseAuthor();
    preflight = new PassingPreflight();
    const storage = new ContentFactoryStorageRepository(storageDir);
    service = new Cf3PilotService(
      prisma,
      orchestrator,
      manifestGate,
      new LessonGenerator(grammarProvider),
      new IndependentContentReviewer(reviewerProvider),
      new ExerciseFactory(exerciseProvider, preflight),
      new ContentValidationRunRepository(prisma),
      new ContentReviewRunRepository(prisma),
      storage,
    );
  });

  afterEach(async () => {
    if (runId) await prisma.contentFactoryRun.delete({ where: { id: runId } }).catch(() => {});
    if (fs.existsSync(storageDir)) fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('runs 3 A1 points through author, validation, review, exercises and readiness audit', async () => {
    const report = await service.runPilot({
      runId,
      manifestRunId,
      targets: [target('A1_CF3_ONE', 1), target('A1_CF3_TWO', 2), target('A1_CF3_THREE', 3)],
    });

    expect(report.status).toBe('READY_FOR_APPROVAL');
    expect(report.readyCount).toBe(3);
    expect(report.points.every((point) => point.status === 'READY_FOR_APPROVAL')).toBe(true);
    expect(manifestGate.calls).toBe(1);
    expect(grammarProvider.calls).toBe(3);
    expect(reviewerProvider.calls).toBe(3);
    expect(exerciseProvider.calls).toBe(3);
    expect(preflight.calls).toBe(36);

    const jobs = await prisma.contentFactoryJob.findMany({ where: { runId } });
    expect(jobs).toHaveLength(15);
    expect(jobs.every((job) => job.state === 'READY_FOR_APPROVAL')).toBe(true);
    expect(jobs.filter((job) => job.purpose === 'AUTHOR_GRAMMAR')).toHaveLength(3);
    expect(jobs.filter((job) => job.purpose === 'REVIEW')).toHaveLength(3);
    expect(jobs.filter((job) => job.purpose === 'AUTHOR_EXERCISES')).toHaveLength(3);
    expect(jobs.filter((job) => job.purpose === 'VALIDATE')).toHaveLength(6);

    expect(await prisma.contentValidationRun.count({ where: { runId } })).toBe(6);
    expect(await prisma.contentReviewRun.count({ where: { runId } })).toBe(3);
    expect(await prisma.contentFactoryApproval.count({ where: { runId } })).toBe(0);
    expect(await prisma.contentPublication.count({ where: { runId } })).toBe(0);
    expect(
      await prisma.contentFactoryArtifact.count({
        where: { runId, artifactType: 'CF3_READINESS_REPORT' },
      }),
    ).toBe(1);
    const run = await prisma.contentFactoryRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('READY FOR OWNER APPROVAL');
  });

  it('continues independent points when one reviewer requests changes', async () => {
    const orchestrator = new ContentFactoryOrchestratorService(prisma, storageDir);
    reviewerProvider = new FakeReviewer('A1_CF3_WEAK');
    service = new Cf3PilotService(
      prisma,
      orchestrator,
      manifestGate,
      new LessonGenerator(grammarProvider),
      new IndependentContentReviewer(reviewerProvider),
      new ExerciseFactory(exerciseProvider, preflight),
      new ContentValidationRunRepository(prisma),
      new ContentReviewRunRepository(prisma),
      new ContentFactoryStorageRepository(storageDir),
    );

    const report = await service.runPilot({
      runId,
      manifestRunId,
      targets: [target('A1_CF3_GOOD_1', 1), target('A1_CF3_WEAK', 2), target('A1_CF3_GOOD_2', 3)],
    });

    expect(report.status).toBe('DRAFT_ONLY');
    expect(report.readyCount).toBe(2);
    expect(report.points.find((point) => point.code === 'A1_CF3_WEAK')?.status).toBe(
      'CHANGES_REQUESTED',
    );
    expect(exerciseProvider.calls).toBe(2);
    expect(await prisma.contentFactoryApproval.count({ where: { runId } })).toBe(0);
    expect(await prisma.contentPublication.count({ where: { runId } })).toBe(0);
    const run = await prisma.contentFactoryRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('DRAFT ONLY');
  });

  it('rejects an out-of-scope pilot before any manifest or provider work', async () => {
    await expect(
      service.runPilot({
        runId,
        manifestRunId,
        targets: [target('A1_ONLY_ONE', 1), target('A1_ONLY_TWO', 2)],
      }),
    ).rejects.toThrow('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');

    expect(manifestGate.calls).toBe(0);
    expect(grammarProvider.calls).toBe(0);
    expect(reviewerProvider.calls).toBe(0);
    expect(exerciseProvider.calls).toBe(0);
  });
});
