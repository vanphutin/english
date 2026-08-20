import { describe, expect, it } from 'vitest';
import { evaluateLevelProgression } from './progression-policy.js';

describe('level progression v1', () => {
  it('unlocks only when every approved condition is met', () => {
    expect(
      evaluateLevelProgression({
        requiredScores: [85, 82, 80, 90, 88],
        masteredCount: 5,
        allHardPrerequisitesMastered: true,
        mixedPracticeAccepted: 9,
        mixedPracticeTotal: 11,
        hasDelayedReviewSuccess: true,
      }).eligible,
    ).toBe(true);
  });
  it('reports every unmet guard instead of silently relaxing policy', () => {
    const decision = evaluateLevelProgression({
      requiredScores: [80, 50],
      masteredCount: 1,
      allHardPrerequisitesMastered: false,
      mixedPracticeAccepted: 2,
      mixedPracticeTotal: 4,
      hasDelayedReviewSuccess: false,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain('REQUIRED_POINT_BELOW_60');
    expect(decision.reasons).toContain('HARD_PREREQUISITES_NOT_MASTERED');
  });
});
