import type { StoryMemoryFact } from './story-types.js';

export const storyPolicyVersion = 'story-journey-v1' as const;
export const maxStoryMemoryFacts = 20;

export function sanitizeStoryFacts(value: unknown): StoryMemoryFact[] {
  if (!Array.isArray(value)) return [];
  const facts = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.value !== 'string') return [];
    const key = record.key.trim().slice(0, 64);
    const factValue = record.value.trim().slice(0, 160);
    return key && factValue ? [{ key, value: factValue }] : [];
  });
  return [...new Map(facts.map((fact) => [fact.key, fact])).values()].slice(-maxStoryMemoryFacts);
}

export function mergeStoryFacts(current: unknown, additions: unknown): StoryMemoryFact[] {
  return sanitizeStoryFacts([...sanitizeStoryFacts(current), ...sanitizeStoryFacts(additions)]);
}
