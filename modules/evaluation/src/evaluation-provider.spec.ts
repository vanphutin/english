import { describe, expect, it } from 'vitest';
import { LayeredEvaluationProvider } from './evaluation-provider.js';
import type { EvaluationContext } from './types.js';

const context = (activityType: string, answer: string): EvaluationContext => ({
  answer,
  activityType,
  promptPayload:
    activityType === 'CORRECT_ERROR'
      ? { incorrectSentence: 'She are tired.', errorCode: 'BE_AGREEMENT' }
      : { sourceSentence: 'He started working here in 2020.', transformationGoalVi: 'Dùng since.' },
  contextVi: 'Ngữ cảnh kiểm thử.',
  sourceTextVi: 'Anh ấy làm việc ở đây từ năm 2020.',
  referenceAnswers: [answer],
  semanticRequirements: ['Preserve meaning', 'Use target form'],
  targetGrammar: [{ code: 'TARGET', title: 'Target grammar' }],
});

describe('LayeredEvaluationProvider activity fast path', () => {
  it.each([
    ['CORRECT_ERROR', 'She is tired.'],
    ['TRANSFORM_SENTENCE', 'He has worked here since 2020.'],
  ])(
    'accepts an exact validated reference for %s without a provider call',
    async (type, answer) => {
      const result = await new LayeredEvaluationProvider(undefined, 'unused').evaluate(
        context(type, answer),
      );
      expect(result.output.dispositionRecommendation).toBe('ACCEPT');
      expect(result.trace.provider).toBe('deterministic');
    },
  );
});
