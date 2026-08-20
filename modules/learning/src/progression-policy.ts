export const PROGRESSION_POLICY_VERSION = 'level-progression-v1';

export interface LevelProgressionInput {
  requiredScores: number[];
  masteredCount: number;
  allHardPrerequisitesMastered: boolean;
  mixedPracticeAccepted: number;
  mixedPracticeTotal: number;
  hasDelayedReviewSuccess: boolean;
}

export interface LevelProgressionDecision {
  eligible: boolean;
  progressScore: number;
  reasons: string[];
}

export const evaluateLevelProgression = (
  input: LevelProgressionInput,
): LevelProgressionDecision => {
  const requiredCount = input.requiredScores.length;
  const masteryPercent = requiredCount ? (input.masteredCount / requiredCount) * 100 : 0;
  const averageScore = requiredCount
    ? input.requiredScores.reduce((sum, score) => sum + score, 0) / requiredCount
    : 0;
  const mixedAccuracy = input.mixedPracticeTotal
    ? (input.mixedPracticeAccepted / input.mixedPracticeTotal) * 100
    : 0;
  const reasons: string[] = [];
  if (!input.allHardPrerequisitesMastered) reasons.push('HARD_PREREQUISITES_NOT_MASTERED');
  if (masteryPercent < 80) reasons.push('REQUIRED_MASTERY_BELOW_80_PERCENT');
  if (input.requiredScores.some((score) => score < 60)) reasons.push('REQUIRED_POINT_BELOW_60');
  if (input.mixedPracticeTotal < 10 || mixedAccuracy < 75)
    reasons.push('MIXED_PRACTICE_REQUIREMENT_NOT_MET');
  if (!input.hasDelayedReviewSuccess) reasons.push('DELAYED_REVIEW_SUCCESS_MISSING');
  return { eligible: reasons.length === 0, progressScore: Math.round(averageScore), reasons };
};
