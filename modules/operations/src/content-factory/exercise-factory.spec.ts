import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import {
  ExerciseFactory,
  type ExercisePreflightPort,
  type ExercisePreflightResult,
} from './exercise-factory.js';
import type { GrammarPointBundleSpec } from './lesson-generator.js';

const grammarPoint: GrammarPointBundleSpec = {
  schemaVersion: '1.0',
  code: 'A1_EXERCISE_POINT',
  family: 'BE_VERB',
  version: 1,
  cefr: 'A1',
  status: 'DRAFT',
  title: 'Present be exercise point',
  learningObjectiveVi: 'Dùng đúng động từ be ở hiện tại trong câu giới thiệu đơn giản.',
  learningObjectiveEn: 'Use the correct present form of be in simple introductions.',
  form: { patterns: ['I + am + complement', 'You + are + complement'] },
  meaning: { uses: ['Identify a person.', 'Describe a simple present state.'] },
  usageConstraints: ['Choose the be form from the grammatical subject.'],
  relationships: { prerequisites: [], buildsOn: [], contrastsWith: [], oftenConfusedWith: [] },
  rules: [
    {
      code: 'A1_EXERCISE_FORM',
      type: 'FORM',
      description: 'Use am with I and are with you.',
    },
  ],
  examples: [
    {
      type: 'AFFIRMATIVE',
      english: 'I am a student.',
      vietnamese: 'Tôi là một học sinh.',
      explanationVi: 'I đi với am.',
    },
    {
      type: 'NEGATIVE',
      english: 'You are not late.',
      vietnamese: 'Bạn không trễ.',
      explanationVi: 'Đặt not sau are.',
    },
    {
      type: 'QUESTION',
      english: 'Are you ready?',
      vietnamese: 'Bạn sẵn sàng chưa?',
      explanationVi: 'Đưa are lên trước you.',
    },
  ],
  commonErrors: [
    {
      code: 'A1_EXERCISE_ERR',
      incorrect: 'I is ready.',
      corrected: 'I am ready.',
      explanationVi: 'I phải đi với am.',
      severity: 'MAJOR',
    },
  ],
  generationPolicy: { requireExplicitTarget: true },
  evaluationPolicy: { referenceAnswersAreNonExhaustive: true },
  provenance: {
    origin: 'AI_GENERATED',
    provider: 'OPENAI',
    model: 'author-model',
    promptVersion: 'cf3-grammar-author-v1',
    generatedAt: '2026-08-20T00:00:00.000Z',
    sourceNotes: ['Provider: OPENAI'],
  },
  license: 'PUBLIC_CONTENT',
};

const activityTypes = [
  'TRANSLATE_CONTEXT',
  'CORRECT_ERROR',
  'TRANSFORM_SENTENCE',
  'COMPLETE_SENTENCE',
] as const;

function presentationPayload(type: (typeof activityTypes)[number], index: number) {
  switch (type) {
    case 'CORRECT_ERROR':
      return { incorrectSentence: `I is student number ${index + 1}.` };
    case 'TRANSFORM_SENTENCE':
      return {
        sourceSentence: `You are learner number ${index + 1}.`,
        transformationGoalVi: 'Đổi chủ ngữ sang I và giữ nguyên ý chính.',
      };
    case 'COMPLETE_SENTENCE':
      return { starter: `I am learner number ${index + 1}` };
    case 'TRANSLATE_CONTEXT':
      return {};
  }
}

class FakeExerciseProvider implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'exercise-author-model';

  constructor(
    private readonly duplicateSemanticHash = false,
    private readonly leakEvaluatorData = false,
  ) {}

  async generateJson() {
    return {
      exercises: Array.from({ length: 12 }, (_, index) => {
        const semanticSource =
          this.duplicateSemanticHash && index === 11 ? 'exercise-10' : `exercise-${index}`;
        const activityType = activityTypes[index % activityTypes.length]!;
        const promptPayload = presentationPayload(activityType, index);
        return {
          contentKey: `exercise-content-${index}`,
          activityType,
          topicCode: `TOPIC_${(index % 6) + 1}`,
          contextVi: `Ngữ cảnh giao tiếp số ${index + 1} dành cho người học A1.`,
          sourceTextVi: `Tôi là học viên số ${index + 1}.`,
          instructionVi: `Hoàn thành nhiệm vụ số ${index + 1} bằng cấu trúc mục tiêu.`,
          promptPayload:
            this.leakEvaluatorData && index === 0
              ? { ...promptPayload, correctAnswer: 'I am a student.' }
              : promptPayload,
          targetNecessity: 'Câu trả lời phải thể hiện đúng dạng be phù hợp với chủ ngữ đã cho.',
          semanticRequirements: ['Giữ nguyên chủ thể và ý nghĩa nhận diện.'],
          allowedAnswers: [`Valid answer ${index + 1}`],
          forbiddenMeaningChanges: ['Không đổi chủ thể.'],
          hints: ['Xác định chủ ngữ trước khi chọn dạng động từ.'],
          variationGroup: `variation-${index % 3}`,
          semanticHash: createHash('sha256').update(semanticSource).digest('hex'),
          difficulty: (index % 3) + 1,
          validationNotes: ['AI_SELF_REPORTED_PREFLIGHT_IS_NOT_AUTHORITY'],
        };
      }),
      provenance: {
        origin: 'AI_DRAFT',
        provider: 'untrusted',
        model: 'untrusted',
        promptVersion: 'untrusted',
        generatedAt: '2020-01-01T00:00:00.000Z',
      },
    };
  }
}

class FakePreflight implements ExercisePreflightPort {
  constructor(private readonly fail: Partial<ExercisePreflightResult> = {}) {}

  async evaluate(): Promise<ExercisePreflightResult> {
    return {
      targetNecessityPassed: this.fail.targetNecessityPassed ?? true,
      ambiguityPassed: this.fail.ambiguityPassed ?? true,
      evaluatorPassed: this.fail.evaluatorPassed ?? true,
      findingCodes: this.fail.findingCodes ?? [],
    };
  }
}

describe('ExerciseFactory', () => {
  it('creates a 12-item bank only after independent preflight passes', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider(), new FakePreflight());
    const batch = await factory.generateMinimumBank({
      grammarPoint,
      count: 12,
      seed: 'seed-123456',
    });

    expect(batch.exercises).toHaveLength(12);
    expect(
      new Set(batch.exercises.map((exercise) => exercise.activityType)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(
      new Set(batch.exercises.map((exercise) => exercise.topicCode)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(batch.exercises[0]?.sourceTextVi).toBeTruthy();
    expect(batch.exercises[1]?.promptPayload.incorrectSentence).toBeTruthy();
    expect(batch.provenance.provider).toBe('OPENAI');
    expect(batch.provenance.model).toBe('exercise-author-model');
    expect(batch.provenance.promptVersion).toBe('cf3-exercise-author-v1');
    expect(batch.grammarPointCode).toBe(grammarPoint.code);
  });

  it('quarantines semantic duplicates instead of counting them toward readiness', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider(true), new FakePreflight());

    await expect(factory.generateMinimumBank({ grammarPoint, count: 12 })).rejects.toThrow(
      'EXERCISE_SEMANTIC_DUPLICATE',
    );
  });

  it('refuses banks below the contract readiness floor', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider(), new FakePreflight());
    await expect(factory.generateMinimumBank({ grammarPoint, count: 11 })).rejects.toThrow(
      'EXERCISE_COUNT_MUST_BE_12_TO_30',
    );
  });

  it('rejects evaluator-only answer data in learner prompt payload', async () => {
    const factory = new ExerciseFactory(
      new FakeExerciseProvider(false, true),
      new FakePreflight(),
    );

    await expect(factory.generateMinimumBank({ grammarPoint, count: 12 })).rejects.toThrow(
      'EXERCISE_PROMPT_PAYLOAD_LEAKS_EVALUATOR_DATA:exercise-content-0:correctAnswer',
    );
  });

  it('does not trust AI-authored validationNotes as evaluator evidence', async () => {
    const factory = new ExerciseFactory(
      new FakeExerciseProvider(),
      new FakePreflight({ evaluatorPassed: false, findingCodes: ['FIXTURE_EVALUATION_FAILED'] }),
    );

    await expect(factory.generateMinimumBank({ grammarPoint, count: 12 })).rejects.toThrow(
      'EXERCISE_PREFLIGHT_FAILED:EVALUATOR:exercise-content-0:FIXTURE_EVALUATION_FAILED',
    );
  });
});
