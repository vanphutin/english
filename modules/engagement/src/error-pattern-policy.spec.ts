import { describe, expect, it } from 'vitest';
import { delayedResolutionMs, projectErrorPatterns } from './error-pattern-policy.js';
import type { ErrorEvidenceEvent } from './types.js';

const at = (hours: number) => new Date(Date.UTC(2026, 7, 18, hours));
const failure = (hours: number, sessionId = 's1'): ErrorEvidenceEvent => ({
  type: 'FAILURE',
  grammarPointId: 'g1',
  category: 'TARGET_GRAMMAR',
  code: 'SUBJECT_VERB_AGREEMENT',
  occurredAt: at(hours),
  sessionId,
  attemptId: `a-${hours}`,
});
const success = (hours: number, sessionId: string): ErrorEvidenceEvent => ({
  type: 'SUCCESS',
  grammarPointId: 'g1',
  occurredAt: at(hours),
  sessionId,
  attemptId: `a-${hours}`,
});

describe('error-pattern-v1', () => {
  it('keeps a correction in the same session active', () => {
    expect(projectErrorPatterns([failure(0), success(1, 's1')])[0]?.state).toBe('ACTIVE');
  });

  it('marks a later-session early success as improving', () => {
    expect(projectErrorPatterns([failure(0), success(2, 's2')])[0]?.state).toBe('IMPROVING');
  });

  it('requires delayed evidence to resolve and detects recurrence', () => {
    const resolved = projectErrorPatterns([
      failure(0),
      { ...success(0, 's2'), occurredAt: new Date(at(0).getTime() + delayedResolutionMs) },
    ]);
    expect(resolved[0]?.state).toBe('RESOLVED');
    expect(
      projectErrorPatterns([
        failure(0),
        { ...success(0, 's2'), occurredAt: new Date(at(0).getTime() + delayedResolutionMs) },
        failure(30, 's3'),
      ])[0]?.state,
    ).toBe('RECURRED');
  });

  it('rebuilds deterministically regardless of input order', () => {
    const events = [failure(0), failure(2, 's2'), success(30, 's3')];
    expect(projectErrorPatterns(events.slice().reverse())).toEqual(projectErrorPatterns(events));
  });
});
