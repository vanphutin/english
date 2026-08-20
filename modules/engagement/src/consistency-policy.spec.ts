import { describe, expect, it } from 'vitest';
import { dateKey, deterministicIndex, isRestDateAllowed } from './consistency-policy.js';

describe('gentle consistency policy', () => {
  it('keeps daily selection stable', () => {
    expect(deterministicIndex('user:2026-08-18', 7)).toBe(deterministicIndex('user:2026-08-18', 7));
  });
  it('normalizes dates and bounds rest-day edits', () => {
    const now = new Date('2026-08-18T12:00:00Z');
    expect(dateKey(now)).toBe('2026-08-18');
    expect(isRestDateAllowed(new Date('2026-08-04T00:00:00Z'), now)).toBe(true);
    expect(isRestDateAllowed(new Date('2026-06-01T00:00:00Z'), now)).toBe(false);
    expect(isRestDateAllowed(new Date('2026-09-10T00:00:00Z'), now)).toBe(false);
  });
});
