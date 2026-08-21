import { describe, expect, it } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { ProviderExercisePreflight } from './provider-exercise-preflight.js';
import type { ExerciseItemSpec } from './exercise-factory.js';
import type { GrammarPointBundleSpec } from './lesson-generator.js';

const grammarPoint = {
  code: 'A1_BE_PRESENT',
  version: 1,
} as GrammarPointBundleSpec;

const exercise = {
  contentKey: 'a1-be-present-001',
} as ExerciseItemSpec;

class FakeReviewerProvider implements ContentFactoryJsonProvider {
  public readonly provider = 'OPENAI' as const;
  public readonly model = 'reviewer-model';

  constructor(private readonly response: unknown) {}

  async generateJson(): Promise<unknown> {
    return this.response;
  }
}

describe('ProviderExercisePreflight', () => {
  it('returns strict independent preflight evidence', async () => {
    const preflight = new ProviderExercisePreflight(
      new FakeReviewerProvider({
        result: {
          targetNecessityPassed: true,
          ambiguityPassed: true,
          evaluatorPassed: true,
          findingCodes: ['PASS', 'PASS'],
        },
      }),
      { provider: 'SECONDARY_OPENAI_COMPATIBLE', model: 'author-model' },
    );

    await expect(preflight.evaluate({ grammarPoint, exercise })).resolves.toEqual({
      targetNecessityPassed: true,
      ambiguityPassed: true,
      evaluatorPassed: true,
      findingCodes: ['PASS'],
    });
  });

  it('rejects malformed reviewer output', async () => {
    const preflight = new ProviderExercisePreflight(
      new FakeReviewerProvider({ targetNecessityPassed: 'yes' }),
      { provider: 'SECONDARY_OPENAI_COMPATIBLE', model: 'author-model' },
    );

    await expect(preflight.evaluate({ grammarPoint, exercise })).rejects.toThrow(
      'EXERCISE_PREFLIGHT_RESPONSE_INVALID',
    );
  });

  it('rejects the same provider/model pair as the exercise author', () => {
    expect(
      () =>
        new ProviderExercisePreflight(new FakeReviewerProvider({}), {
          provider: 'OPENAI',
          model: 'reviewer-model',
        }),
    ).toThrow('EXERCISE_PREFLIGHT_MUST_BE_INDEPENDENT_FROM_AUTHOR');
  });
});
