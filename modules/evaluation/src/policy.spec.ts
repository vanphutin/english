import { describe, expect, it } from 'vitest';
import { adjudicate } from './policy.js';
import type { AiEvaluationOutput } from './types.js';

const output = (status: 'PASS' | 'FAIL' | 'UNCERTAIN'): AiEvaluationOutput => ({
  schemaVersion: '1.0',
  dispositionRecommendation: 'ACCEPT',
  dimensions: Object.fromEntries(
    [
      'meaningPreservation',
      'targetGrammar',
      'otherGrammar',
      'vocabulary',
      'mechanics',
      'naturalness',
    ].map((key) => [key, { status, confidence: 1 }]),
  ) as AiEvaluationOutput['dimensions'],
  findings: [],
  feedbackVi: 'ok',
  acceptedAlternative: false,
  uncertaintyReasons: [],
});
describe('adjudicate', () => {
  it('accepts when meaning and target pass', () =>
    expect(adjudicate(output('PASS'))).toBe('ACCEPT'));
  it('requires retry when target or meaning fails', () =>
    expect(adjudicate(output('FAIL'))).toBe('RETRY'));
  it('routes uncertainty to system review', () =>
    expect(adjudicate(output('UNCERTAIN'))).toBe('SYSTEM_REVIEW'));
});
