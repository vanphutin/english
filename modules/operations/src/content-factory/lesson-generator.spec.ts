import { describe, expect, it } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { LessonGenerator, type PilotGrammarTarget } from './lesson-generator.js';

function target(code: string): PilotGrammarTarget {
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
    sortOrder: 1,
    cefr: 'A1',
  };
}

class FakeAuthorProvider implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'fake-author-model';
  public readonly requests: unknown[] = [];

  constructor(private readonly commonErrorCount = 3) {}

  async generateJson(request: Parameters<ContentFactoryJsonProvider['generateJson']>[0]) {
    const input = JSON.parse(request.input) as { manifestItem: PilotGrammarTarget };
    this.requests.push(input);
    const point = input.manifestItem;
    return {
      schemaVersion: '1.0',
      code: 'MODEL_MUST_NOT_CONTROL_CODE',
      family: point.family,
      version: 999,
      cefr: 'C2',
      status: 'PUBLISHED',
      title: point.titleVi,
      learningObjectiveVi: 'Dùng đúng động từ be ở hiện tại trong câu giới thiệu đơn giản.',
      learningObjectiveEn: 'Use the correct present form of be in simple introductions.',
      form: { patterns: ['I + am + complement', 'He/She + is + complement'] },
      meaning: { uses: ['Identify a person.', 'Describe a simple present state.'] },
      usageConstraints: ['Choose the be form from the grammatical subject.'],
      relationships: {
        prerequisites: ['SHOULD_BE_REPLACED'],
        buildsOn: [],
        contrastsWith: [],
        oftenConfusedWith: [],
      },
      rules: [
        {
          code: `${point.code}_FORM`,
          type: 'FORM',
          description: 'Use am with I and is with he or she.',
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
          explanationVi: 'Đặt not sau is để tạo phủ định.',
        },
        {
          type: 'QUESTION',
          english: 'Are you ready?',
          vietnamese: 'Bạn đã sẵn sàng chưa?',
          explanationVi: 'Đưa are lên trước chủ ngữ you để hỏi.',
        },
      ],
      commonErrors: Array.from({ length: this.commonErrorCount }, (_, index) => ({
        code: `${point.code}_ERR_${index + 1}`,
        incorrect: index === 0 ? 'I is a student.' : `Incorrect be form ${index + 1}.`,
        corrected: index === 0 ? 'I am a student.' : `Correct be form ${index + 1}.`,
        explanationVi: `Lỗi độc lập số ${index + 1} về cách chọn dạng động từ be.`,
        severity: 'MAJOR',
      })),
      generationPolicy: { allowedContexts: ['PEOPLE'], requireExplicitTarget: true },
      evaluationPolicy: {
        mustCheck: ['subject-be agreement'],
        referenceAnswersAreNonExhaustive: true,
      },
      provenance: {
        origin: 'AI_GENERATED',
        model: 'dishonest-model-label',
        promptVersion: 'dishonest-prompt-label',
        generatedAt: '2020-01-01T00:00:00.000Z',
      },
      license: 'PUBLIC_CONTENT',
    };
  }
}

describe('LessonGenerator CF3 pilot', () => {
  it('authors exactly 3–5 A1 points with one provider request per manifest item', async () => {
    const provider = new FakeAuthorProvider();
    const generator = new LessonGenerator(provider);
    const bundles = await generator.generatePilotA1Packages([
      target('A1_PILOT_ONE'),
      target('A1_PILOT_TWO'),
      target('A1_PILOT_THREE'),
    ]);

    expect(bundles).toHaveLength(3);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests.every((request) => Object.hasOwn(request as object, 'manifestItem'))).toBe(
      true,
    );
    expect(bundles.every((bundle) => bundle.cefr === 'A1' && bundle.status === 'DRAFT')).toBe(true);
    expect(bundles.every((bundle) => bundle.commonErrors.length >= 3)).toBe(true);
    expect(bundles[0]?.code).toBe('A1_PILOT_ONE');
    expect(bundles[0]?.provenance.model).toBe('fake-author-model');
    expect(bundles[0]?.provenance.promptVersion).toBe('cf3-grammar-author-v1');
    expect(bundles[0]?.provenance.sourceNotes).toContain('Provider: OPENAI');
  });

  it('refuses to expand CF3 below or above the contract pilot scope', async () => {
    const generator = new LessonGenerator(new FakeAuthorProvider());

    await expect(
      generator.generatePilotA1Packages([target('A1_ONE'), target('A1_TWO')]),
    ).rejects.toThrow('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');

    await expect(
      generator.generatePilotA1Packages([
        target('A1_ONE'),
        target('A1_TWO'),
        target('A1_THREE'),
        target('A1_FOUR'),
        target('A1_FIVE'),
        target('A1_SIX'),
      ]),
    ).rejects.toThrow('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');
  });

  it('rejects duplicate GrammarPoint targets before any provider call', async () => {
    const provider = new FakeAuthorProvider();
    const generator = new LessonGenerator(provider);

    await expect(
      generator.generatePilotA1Packages([
        target('A1_DUPLICATE'),
        target('A1_DUPLICATE'),
        target('A1_OTHER'),
      ]),
    ).rejects.toThrow('CF3_PILOT_TARGETS_MUST_BE_UNIQUE');
    expect(provider.requests).toHaveLength(0);
  });

  it('rejects superficially valid bundles without three distinct common errors', async () => {
    const generator = new LessonGenerator(new FakeAuthorProvider(1));

    await expect(
      generator.generatePilotA1Packages([
        target('A1_ERROR_ONE'),
        target('A1_ERROR_TWO'),
        target('A1_ERROR_THREE'),
      ]),
    ).rejects.toThrow('CF3_COMMON_ERRORS_INSUFFICIENT:A1_ERROR_ONE');
  });
});
