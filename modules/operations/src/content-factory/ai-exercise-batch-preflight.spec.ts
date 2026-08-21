import { describe, expect, it, vi } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { AiExerciseBatchPreflight } from './ai-exercise-batch-preflight.js';
import type { ExerciseItemSpec } from './exercise-factory.js';
import type { GrammarPointBundleSpec } from './lesson-generator.js';

function exercise(contentKey: string): ExerciseItemSpec {
  return { contentKey } as ExerciseItemSpec;
}

function grammar(): GrammarPointBundleSpec {
  return { code: 'A1_TEST', version: 1 } as GrammarPointBundleSpec;
}

function provider(response: unknown): ContentFactoryJsonProvider {
  return {
    provider: 'OPENAI',
    model: 'review-model',
    generateJson: vi.fn(async () => response),
  };
}

describe('AiExerciseBatchPreflight', () => {
  it('accepts exact complete evidence for the exercise bank', async () => {
    const reviewer = provider({
      results: [
        {
          contentKey: 'ex-1',
          targetNecessityPassed: true,
          ambiguityPassed: true,
          evaluatorPassed: true,
          findingCodes: [],
        },
        {
          contentKey: 'ex-2',
          targetNecessityPassed: true,
          ambiguityPassed: true,
          evaluatorPassed: true,
          findingCodes: [],
        },
      ],
    });
    const preflight = new AiExerciseBatchPreflight(reviewer, {
      provider: 'OPENAI',
      model: 'author-model',
    });

    const result = await preflight.evaluateBatch({
      grammarPoint: grammar(),
      exercises: [exercise('ex-1'), exercise('ex-2')],
    });

    expect(result.map((item) => item.contentKey)).toEqual(['ex-1', 'ex-2']);
    expect(reviewer.generateJson).toHaveBeenCalledOnce();
  });

  it('rejects incomplete or unknown content-key coverage', async () => {
    const reviewer = provider({
      results: [
        {
          contentKey: 'unknown',
          targetNecessityPassed: true,
          ambiguityPassed: true,
          evaluatorPassed: true,
          findingCodes: [],
        },
      ],
    });
    const preflight = new AiExerciseBatchPreflight(reviewer, {
      provider: 'OPENAI',
      model: 'author-model',
    });

    await expect(
      preflight.evaluateBatch({
        grammarPoint: grammar(),
        exercises: [exercise('ex-1')],
      }),
    ).rejects.toThrow('EXERCISE_PREFLIGHT_UNKNOWN_CONTENT_KEY:unknown');
  });

  it('requires contract reason-code families for failed evidence', async () => {
    const reviewer = provider({
      results: [
        {
          contentKey: 'ex-1',
          targetNecessityPassed: false,
          ambiguityPassed: true,
          evaluatorPassed: true,
          findingCodes: ['MADE_UP_CODE'],
        },
      ],
    });
    const preflight = new AiExerciseBatchPreflight(reviewer, {
      provider: 'OPENAI',
      model: 'author-model',
    });

    await expect(
      preflight.evaluateBatch({
        grammarPoint: grammar(),
        exercises: [exercise('ex-1')],
      }),
    ).rejects.toThrow('EXERCISE_PREFLIGHT_FINDING_CODE_INVALID');
  });

  it('requires a reason code whenever a semantic gate fails', async () => {
    const reviewer = provider({
      results: [
        {
          contentKey: 'ex-1',
          targetNecessityPassed: true,
          ambiguityPassed: false,
          evaluatorPassed: true,
          findingCodes: [],
        },
      ],
    });
    const preflight = new AiExerciseBatchPreflight(reviewer, {
      provider: 'OPENAI',
      model: 'author-model',
    });

    await expect(
      preflight.evaluateBatch({
        grammarPoint: grammar(),
        exercises: [exercise('ex-1')],
      }),
    ).rejects.toThrow('EXERCISE_PREFLIGHT_FAILURE_REQUIRES_REASON_CODE');
  });

  it('refuses a reviewer that is the same provider/model as the author', () => {
    expect(
      () =>
        new AiExerciseBatchPreflight(provider({ results: [] }), {
          provider: 'OPENAI',
          model: 'review-model',
        }),
    ).toThrow('EXERCISE_PREFLIGHT_MUST_BE_INDEPENDENT_FROM_AUTHOR');
  });
});
