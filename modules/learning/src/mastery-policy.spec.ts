import { describe, expect, it } from 'vitest';
import { applyMasteryEvidence, type MasteryState } from './mastery-policy.js';

const unseen = (): MasteryState => ({
  band: 'UNSEEN',
  masteryScore: 0,
  retentionScore: 0,
  confidence: 0,
  evidenceCount: 0,
  independentSuccessCount: 0,
  assistedSuccessCount: 0,
  distinctSessionCount: 0,
  currentStreak: 0,
});
const at = new Date('2026-01-01T00:00:00.000Z');

describe('mastery policy v1', () => {
  it('gives the strongest evidence to an independent first-attempt success', () => {
    const result = applyMasteryEvidence(unseen(), {
      disposition: 'ACCEPT',
      attemptNo: 1,
      usedHint: false,
      occurredAt: at,
      priorSessionAlreadyCounted: false,
    });
    expect(result.evidenceWeight).toBe(1);
    expect(result.masteryScore).toBe(20);
    expect(result.independentSuccessCount).toBe(1);
  });
  it('reduces evidence for hint-assisted success', () => {
    const result = applyMasteryEvidence(unseen(), {
      disposition: 'ACCEPT',
      attemptNo: 1,
      usedHint: true,
      occurredAt: at,
      priorSessionAlreadyCounted: false,
    });
    expect(result.evidenceWeight).toBe(0.5);
    expect(result.assistedSuccessCount).toBe(1);
  });
  it('gives system review zero evidence and no projection change', () => {
    const state = { ...unseen(), masteryScore: 55, evidenceCount: 3, band: 'PRACTICING' as const };
    const result = applyMasteryEvidence(state, {
      disposition: 'SYSTEM_REVIEW',
      attemptNo: 1,
      usedHint: false,
      occurredAt: at,
      priorSessionAlreadyCounted: false,
    });
    expect(result.masteryScore).toBe(55);
    expect(result.evidenceCount).toBe(3);
    expect(result.evidenceWeight).toBe(0);
  });
  it('requires five evidence, three independent successes and two sessions for mastery', () => {
    const state: MasteryState = {
      ...unseen(),
      band: 'PRACTICING',
      masteryScore: 79,
      confidence: 0.69,
      evidenceCount: 4,
      independentSuccessCount: 2,
      distinctSessionCount: 1,
    };
    const result = applyMasteryEvidence(state, {
      disposition: 'ACCEPT',
      attemptNo: 1,
      usedHint: false,
      occurredAt: at,
      priorSessionAlreadyCounted: false,
    });
    expect(result.band).toBe('MASTERED');
  });
});
