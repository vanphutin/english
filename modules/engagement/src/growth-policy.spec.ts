import { describe, expect, it } from 'vitest';
import { validateInterestTopics, weekBounds } from './growth-policy.js';

describe('engagement growth policy', () => {
  it('accepts ordered approved topics and rejects duplicates, unknown values, or more than five', () => {
    expect(validateInterestTopics(['FOOD', 'TRAVEL'])).toBe(true);
    expect(validateInterestTopics(['FOOD', 'FOOD'])).toBe(false);
    expect(validateInterestTopics(['UNKNOWN'])).toBe(false);
    expect(validateInterestTopics(['FOOD', 'TRAVEL', 'WORK', 'STUDY', 'HEALTH', 'NATURE'])).toBe(
      false,
    );
  });
  it('uses stable Monday-to-Monday UTC report intervals', () => {
    const bounds = weekBounds(new Date('2026-08-18T12:00:00Z'));
    expect(bounds.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });
});
