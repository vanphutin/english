import type { ErrorEvidenceEvent, ProjectedErrorPattern } from './types.js';

export const errorPatternPolicyVersion = 'error-pattern-v1' as const;
export const delayedResolutionMs = 24 * 60 * 60 * 1000;

const keyOf = (event: Pick<ErrorEvidenceEvent, 'grammarPointId' | 'category' | 'code'>): string =>
  `${event.grammarPointId}:${event.category ?? ''}:${event.code ?? ''}`;

/** Replays immutable evidence; a same-session retry can improve an answer but cannot resolve a pattern. */
export const projectErrorPatterns = (events: ErrorEvidenceEvent[]): ProjectedErrorPattern[] => {
  const patterns = new Map<string, ProjectedErrorPattern & { lastFailureSessionId: string }>();
  for (const event of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    if (event.type === 'FAILURE') {
      if (!event.category || !event.code) continue;
      const key = keyOf(event);
      const existing = patterns.get(key);
      patterns.set(key, {
        grammarPointId: event.grammarPointId,
        category: event.category,
        code: event.code,
        state: existing?.state === 'RESOLVED' ? 'RECURRED' : 'ACTIVE',
        occurrenceCount: (existing?.occurrenceCount ?? 0) + 1,
        firstSeenAt: existing?.firstSeenAt ?? event.occurredAt,
        lastSeenAt: event.occurredAt,
        lastSuccessAt: existing?.lastSuccessAt ?? null,
        representativeAttemptId: event.attemptId,
        lastFailureSessionId: event.sessionId,
      });
      continue;
    }
    for (const pattern of patterns.values()) {
      if (
        pattern.grammarPointId !== event.grammarPointId ||
        pattern.lastFailureSessionId === event.sessionId ||
        event.occurredAt < pattern.lastSeenAt
      )
        continue;
      pattern.lastSuccessAt = event.occurredAt;
      pattern.state =
        event.occurredAt.getTime() - pattern.lastSeenAt.getTime() >= delayedResolutionMs
          ? 'RESOLVED'
          : 'IMPROVING';
    }
  }
  return [...patterns.values()].map((pattern) => ({
    grammarPointId: pattern.grammarPointId,
    category: pattern.category,
    code: pattern.code,
    state: pattern.state,
    occurrenceCount: pattern.occurrenceCount,
    firstSeenAt: pattern.firstSeenAt,
    lastSeenAt: pattern.lastSeenAt,
    lastSuccessAt: pattern.lastSuccessAt,
    representativeAttemptId: pattern.representativeAttemptId,
  }));
};
