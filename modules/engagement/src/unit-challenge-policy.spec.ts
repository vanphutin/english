import { describe, expect, it } from 'vitest';
import { classifyUnitChallengeEvidence } from './unit-challenge-policy.js';

describe('unit-challenge-v1', () => {
  it.each([null, 'SYSTEM_REVIEW'])(
    'keeps missing or system-failed evidence neutral (%s)',
    (disposition) => expect(classifyUnitChallengeEvidence(disposition)).toBe('NO_EVIDENCE'),
  );

  it.each(['ACCEPT', 'ACCEPT_WITH_FEEDBACK'])('passes accepted evidence (%s)', (disposition) =>
    expect(classifyUnitChallengeEvidence(disposition)).toBe('PASSED'),
  );

  it('marks a reliable retry as needing practice', () =>
    expect(classifyUnitChallengeEvidence('RETRY')).toBe('NEEDS_PRACTICE'));
});
