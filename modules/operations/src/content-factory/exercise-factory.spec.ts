import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { ExerciseFactory } from './exercise-factory.js';
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
  rules: [{ code: 'A1_EXERCISE_FORM', type: 'FORM', description: 'Use am with I and are with you.' }],
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

class FakeExerciseProvider implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'exercise-author-model';

  constructor(private readonly duplicateSemanticHash = false) {}

  async generateJson() {
    return {
      exercises: Array.from({ length: 12 }, (_, index) => {
        const semanticSource = this.duplicateSemanticHash && index === 11 ? 'exercise-10' : `exercise-${index}`;
        return {
          contentKey: `exercise-content-${index}`,
          activityType: activityTypes[index % activityTypes.length],
          topicCode: `TOPIC_${(index % 6) + 1}`,
          contextVi: `Ngữ cảnh giao tiếp số ${index + 1} dành cho người học A1.`,
          instructionVi: `Hoàn thành nhiệm vụ số ${index + 1} bằng cấu trúc mục tiêu.`,
          targetNecessity: 'Câu trả lời phải thể hiện đúng dạng be phù hợp với chủ ngữ đã cho.',
          semanticRequirements: ['Giữ nguyên chủ thể và ý nghĩa nhận diện.'],
          allowedAnswers: [`Valid answer ${index + 1}`],
          forbiddenMeaningChanges: ['Không đổi chủ thể.'],
          hints: ['Xác định chủ ngữ trước khi chọn dạng động từ.'],
          variationGroup: `variation-${index % 3}`,
          semanticHash: createHash('sha256').update(semanticSource).digest('hex'),
          difficulty: (index % 3) + 1,
          validationNotes: [
            'TARGET_NECESSITY_VERIFIED',
            'AMBIGUITY_CHECKED',
            'EVALUATOR_PREFLIGHT_PASSED',
          ],
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

describe('ExerciseFactory', () => {
  it('creates a 12-item minimum bank with diversity and trusted provenance', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider());
    const batch = await factory.generateMinimumBank({ grammarPoint, count: 12, seed: 'seed-123456' });

    expect(batch.exercises).toHaveLength(12);
    expect(new Set(batch.exercises.map((exercise) => exercise.activityType)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(batch.exercises.map((exercise) => exercise.topicCode)).size).toBeGreaterThanOrEqual(6);
    expect(batch.provenance.provider).toBe('OPENAI');
    expect(batch.provenance.model).toBe('exercise-author-model');
    expect(batch.provenance.promptVersion).toBe('cf3-exercise-author-v1');
    expect(batch.grammarPointCode).toBe(grammarPoint.code);
  });

  it('quarantines semantic duplicates instead of counting them toward readiness', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider(true));

    await expect(factory.generateMinimumBank({ grammarPoint, count: 12 })).rejects.toThrow(
      'EXERCISE_SEMANTIC_DUPLICATE',
    );
  });

  it('refuses banks below the contract readiness floor', async () => {
    const factory = new ExerciseFactory(new FakeExerciseProvider());
    await expect(factory.generateMinimumBank({ grammarPoint, count: 11 })).rejects.toThrow(
      'EXERCISE_COUNT_MUST_BE_12_TO_30',
    );
  });
});
