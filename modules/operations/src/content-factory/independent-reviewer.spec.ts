import { describe, expect, it } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { IndependentContentReviewer } from './independent-reviewer.js';
import type { GrammarPointBundleSpec } from './lesson-generator.js';

const artifact: GrammarPointBundleSpec = {
  schemaVersion: '1.0',
  code: 'A1_REVIEW_POINT',
  family: 'BE_VERB',
  version: 1,
  cefr: 'A1',
  status: 'DRAFT',
  title: 'Present be review point',
  learningObjectiveVi: 'Dùng đúng động từ be ở hiện tại trong câu giới thiệu đơn giản.',
  learningObjectiveEn: 'Use the correct present form of be in simple introductions.',
  form: { patterns: ['I + am + complement', 'You + are + complement'] },
  meaning: { uses: ['Identify a person.', 'Describe a simple present state.'] },
  usageConstraints: ['Choose the be form from the grammatical subject.'],
  relationships: { prerequisites: [], buildsOn: [], contrastsWith: [], oftenConfusedWith: [] },
  rules: [{ code: 'A1_REVIEW_FORM', type: 'FORM', description: 'Use am with I and are with you.' }],
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
      code: 'A1_REVIEW_ERR',
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

class FakeReviewer implements ContentFactoryJsonProvider {
  public readonly provider = 'SECONDARY_OPENAI_COMPATIBLE' as const;
  public readonly model = 'reviewer-model';

  constructor(private readonly total = 96) {}

  async generateJson() {
    return {
      schemaVersion: '1.0',
      artifactCode: 'MODEL_SUPPLIED_CODE_IS_IGNORED',
      artifactVersion: 999,
      artifactHash: '0'.repeat(64),
      reviewer: {
        provider: 'untrusted',
        model: 'untrusted',
        promptVersion: 'untrusted',
        runId: '00000000-0000-4000-8000-000000000000',
      },
      decision: 'PASS',
      confidence: 0.95,
      scores: {
        correctness: this.total >= 88 ? 30 : 20,
        specificity: 14,
        examples: 14,
        vietnamesePedagogy: 10,
        cefrFit: 10,
        evaluatorReadiness: this.total >= 88 ? 10 : 6,
        originalityDiversity: 4,
        provenanceCompleteness: 4,
        total: this.total,
      },
      findings: [],
      reviewedAt: '2020-01-01T00:00:00.000Z',
    };
  }
}

describe('IndependentContentReviewer', () => {
  it('stamps trusted reviewer metadata and applies the quality gate', async () => {
    const reviewer = new IndependentContentReviewer(new FakeReviewer());
    const result = await reviewer.reviewGrammarPoint({
      runId: '11111111-1111-4111-8111-111111111111',
      artifact,
      authorProvider: 'OPENAI',
      authorModel: 'author-model',
    });

    expect(result.report.artifactCode).toBe(artifact.code);
    expect(result.report.artifactVersion).toBe(artifact.version);
    expect(result.report.reviewer.provider).toBe('SECONDARY_OPENAI_COMPATIBLE');
    expect(result.report.reviewer.model).toBe('reviewer-model');
    expect(result.report.reviewer.promptVersion).toBe('cf3-independent-review-v1');
    expect(result.readyForOwnerApproval).toBe(true);
  });

  it('does not let a PASS label bypass contract score thresholds', async () => {
    const reviewer = new IndependentContentReviewer(new FakeReviewer(70));
    const result = await reviewer.reviewGrammarPoint({
      runId: '11111111-1111-4111-8111-111111111111',
      artifact,
      authorProvider: 'OPENAI',
      authorModel: 'author-model',
    });

    expect(result.report.decision).toBe('PASS');
    expect(result.readyForOwnerApproval).toBe(false);
  });

  it('rejects the same provider and model as the author', async () => {
    const sameProvider: ContentFactoryJsonProvider = {
      provider: 'OPENAI',
      model: 'author-model',
      generateJson: async () => ({}),
    };
    const reviewer = new IndependentContentReviewer(sameProvider);

    await expect(
      reviewer.reviewGrammarPoint({
        runId: '11111111-1111-4111-8111-111111111111',
        artifact,
        authorProvider: 'OPENAI',
        authorModel: 'author-model',
      }),
    ).rejects.toThrow('REVIEWER_MUST_BE_INDEPENDENT_FROM_AUTHOR');
  });
});
