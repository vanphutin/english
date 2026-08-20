import type { UnitChallengeOutcome } from './types.js';

export const unitChallengePolicyVersion = 'unit-challenge-v1' as const;

/** Infrastructure uncertainty must remain neutral; only reliable learner evidence is classified. */
export function classifyUnitChallengeEvidence(disposition: string | null): UnitChallengeOutcome {
  if (!disposition || disposition === 'SYSTEM_REVIEW') return 'NO_EVIDENCE';
  if (disposition === 'ACCEPT' || disposition === 'ACCEPT_WITH_FEEDBACK') return 'PASSED';
  return 'NEEDS_PRACTICE';
}
