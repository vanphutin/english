import { describe, expect, it } from 'vitest';
import { maxStoryMemoryFacts, mergeStoryFacts, sanitizeStoryFacts } from './story-policy.js';

describe('story-journey-v1 memory', () => {
  it('accepts only bounded key/value story facts', () => {
    expect(sanitizeStoryFacts([{ key: 'place', value: 'Hanoi' }, { secret: 'no' }])).toEqual([
      { key: 'place', value: 'Hanoi' },
    ]);
  });

  it('replaces a fact by key and enforces the global limit', () => {
    const current = Array.from({ length: maxStoryMemoryFacts }, (_, index) => ({
      key: `k${index}`,
      value: `${index}`,
    }));
    const merged = mergeStoryFacts(current, [
      { key: 'k19', value: 'updated' },
      { key: 'new', value: 'yes' },
    ]);
    expect(merged).toHaveLength(maxStoryMemoryFacts);
    expect(merged.at(-1)).toEqual({ key: 'new', value: 'yes' });
  });
});
