export const MASTERY_POLICY_VERSION = 'mastery-v1' as const;

export interface MasteryState {
  band: 'UNSEEN' | 'LEARNING' | 'PRACTICING' | 'MASTERED' | 'REVIEW_DUE' | 'AT_RISK';
  masteryScore: number;
  retentionScore: number;
  confidence: number;
  evidenceCount: number;
  independentSuccessCount: number;
  assistedSuccessCount: number;
  distinctSessionCount: number;
  currentStreak: number;
}

export interface MasteryEvidence {
  disposition: 'ACCEPT' | 'ACCEPT_WITH_FEEDBACK' | 'RETRY' | 'SYSTEM_REVIEW';
  attemptNo: number;
  usedHint: boolean;
  occurredAt: Date;
  priorSessionAlreadyCounted: boolean;
}

export interface MasteryUpdate extends MasteryState {
  evidenceType: string;
  evidenceWeight: number;
  scoreDelta: number;
  reasonCodes: string[];
  nextReviewAt: Date | null;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Applies approved v1 thresholds to one auditable evaluation. Provider/system failures are zero
 * evidence, while retries and hints reduce weight. Constants are centralized here so projections
 * can be rebuilt deterministically when policy versions change.
 */
export function applyMasteryEvidence(
  state: MasteryState,
  evidence: MasteryEvidence,
): MasteryUpdate {
  if (evidence.disposition === 'SYSTEM_REVIEW')
    return {
      ...state,
      evidenceType: 'SYSTEM_ZERO_WEIGHT',
      evidenceWeight: 0,
      scoreDelta: 0,
      reasonCodes: ['SYSTEM_REVIEW'],
      nextReviewAt: null,
    };

  const accepted =
    evidence.disposition === 'ACCEPT' || evidence.disposition === 'ACCEPT_WITH_FEEDBACK';
  const independent = accepted && evidence.attemptNo === 1 && !evidence.usedHint;
  const weight = accepted ? (independent ? 1 : evidence.usedHint ? 0.5 : 0.65) : 0.75;
  const baseDelta = accepted ? (evidence.disposition === 'ACCEPT' ? 20 : 16) : -12;
  const scoreDelta = baseDelta * weight;
  const masteryScore = clamp(state.masteryScore + scoreDelta, 0, 100);
  const evidenceCount = state.evidenceCount + 1;
  const independentSuccessCount = state.independentSuccessCount + (independent ? 1 : 0);
  const assistedSuccessCount = state.assistedSuccessCount + (accepted && !independent ? 1 : 0);
  const distinctSessionCount =
    state.distinctSessionCount + (evidence.priorSessionAlreadyCounted ? 0 : 1);
  const confidence = clamp(state.confidence + (independent ? 0.16 : accepted ? 0.08 : 0.05), 0, 1);
  const retentionScore = accepted
    ? clamp(Math.max(state.retentionScore, masteryScore), 0, 100)
    : clamp(state.retentionScore - 10, 0, 100);
  const currentStreak = accepted ? state.currentStreak + 1 : 0;
  const wasMastered = ['MASTERED', 'REVIEW_DUE', 'AT_RISK'].includes(state.band);
  let band: MasteryState['band'] =
    evidenceCount < 3 || masteryScore < 50
      ? 'LEARNING'
      : masteryScore < 80
        ? 'PRACTICING'
        : 'LEARNING';
  if (
    masteryScore >= 80 &&
    confidence >= 0.7 &&
    evidenceCount >= 5 &&
    independentSuccessCount >= 3 &&
    distinctSessionCount >= 2
  )
    band = 'MASTERED';
  if (wasMastered && (masteryScore < 70 || retentionScore < 70)) band = 'AT_RISK';
  const intervalDays = accepted
    ? Math.min(30, independent ? 2 ** Math.min(currentStreak, 4) : 2)
    : 1;
  const nextReviewAt = new Date(evidence.occurredAt.getTime() + intervalDays * 86_400_000);
  return {
    band,
    masteryScore,
    retentionScore,
    confidence,
    evidenceCount,
    independentSuccessCount,
    assistedSuccessCount,
    distinctSessionCount,
    currentStreak,
    evidenceType: independent
      ? 'INDEPENDENT_SUCCESS'
      : accepted
        ? 'ASSISTED_SUCCESS'
        : 'TARGET_FAILURE',
    evidenceWeight: weight,
    scoreDelta,
    reasonCodes: [
      evidence.disposition,
      ...(evidence.usedHint ? ['HINT_USED'] : []),
      ...(evidence.attemptNo > 1 ? ['RETRY'] : []),
    ],
    nextReviewAt,
  };
}
