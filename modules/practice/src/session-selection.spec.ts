import { describe, expect, it } from 'vitest';
import { selectSessionExercises, type SelectionCandidate } from './session-selection.js';

const candidate = (id: string, bucket: SelectionCandidate['bucket']): SelectionCandidate => ({
  id,
  bucket,
});

describe('session selection v1', () => {
  it('selects the 40/35/25 mix for a ten-item session', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, index) => candidate(`n${index}`, 'CURRENT_CURRICULUM')),
      ...Array.from({ length: 4 }, (_, index) => candidate(`r${index}`, 'DUE_REVIEW')),
      ...Array.from({ length: 3 }, (_, index) => candidate(`w${index}`, 'WEAK_TARGET')),
    ];
    const result = selectSessionExercises(pool, 10);
    expect(result.filter((item) => item.bucket === 'CURRENT_CURRICULUM')).toHaveLength(4);
    expect(result.filter((item) => item.bucket === 'DUE_REVIEW')).toHaveLength(3);
    expect(result.filter((item) => item.bucket === 'WEAK_TARGET')).toHaveLength(3);
  });

  it('reallocates empty buckets without duplicates', () => {
    const result = selectSessionExercises(
      Array.from({ length: 5 }, (_, index) => candidate(`n${index}`, 'CURRENT_CURRICULUM')),
      4,
    );
    expect(result).toHaveLength(4);
    expect(new Set(result.map((item) => item.id)).size).toBe(4);
  });

  it('rotates deterministically and prefers distinct grammar groups', () => {
    const pool = [
      { ...candidate('a1', 'CURRENT_CURRICULUM'), groupKey: 'A' },
      { ...candidate('a2', 'CURRENT_CURRICULUM'), groupKey: 'A' },
      { ...candidate('b1', 'CURRENT_CURRICULUM'), groupKey: 'B' },
      { ...candidate('c1', 'CURRENT_CURRICULUM'), groupKey: 'C' },
    ];
    const first = selectSessionExercises(pool, 3, false, 'learner-session-1');
    const repeated = selectSessionExercises(pool, 3, false, 'learner-session-1');
    expect(repeated.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(new Set(first.map((item) => item.groupKey))).toHaveLength(3);
  });

  it('avoids equivalent meanings and selects at least three activity types for five items', () => {
    const pool = Array.from({ length: 8 }, (_, index) => ({
      ...candidate(`e${index}`, 'CURRENT_CURRICULUM'),
      semanticHash: index < 2 ? 'same' : `meaning-${index}`,
      activityType: ['TRANSLATE_CONTEXT', 'CORRECT_ERROR', 'COMPLETE_SENTENCE', 'MINI_DIALOGUE'][
        index % 4
      ]!,
      topicCode: `topic-${index % 3}`,
    }));
    const result = selectSessionExercises(pool, 5, false, 'diversity');
    expect(result).toHaveLength(5);
    expect(new Set(result.map((item) => item.semanticHash))).toHaveLength(5);
    expect(new Set(result.map((item) => item.activityType)).size).toBeGreaterThanOrEqual(3);
  });

  it('does not schedule one activity more than twice consecutively when an alternative exists', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, index) => ({
        ...candidate(`translate-${index}`, 'CURRENT_CURRICULUM'),
        activityType: 'TRANSLATE_CONTEXT',
        semanticHash: `translate-${index}`,
      })),
      {
        ...candidate('dialogue', 'CURRENT_CURRICULUM'),
        activityType: 'MINI_DIALOGUE',
        semanticHash: 'dialogue',
      },
    ];
    const result = selectSessionExercises(pool, 5, false, 'streak-policy');
    expect(
      result.some(
        (item, index) =>
          index >= 2 &&
          item.activityType === result[index - 1]?.activityType &&
          item.activityType === result[index - 2]?.activityType,
      ),
    ).toBe(false);
  });

  it('uses a preferred topic as a tie-break without displacing review evidence', () => {
    const result = selectSessionExercises(
      [
        { ...candidate('current-a', 'CURRENT_CURRICULUM'), topicCode: 'WORK' },
        { ...candidate('current-b', 'CURRENT_CURRICULUM'), topicCode: 'STUDY' },
        {
          ...candidate('preferred', 'CURRENT_CURRICULUM'),
          topicCode: 'FOOD',
          preferredTopic: true,
        },
        candidate('review', 'DUE_REVIEW'),
      ],
      3,
      false,
      'interest-ranking',
    );
    expect(result.some((item) => item.id === 'preferred')).toBe(true);
    expect(result.some((item) => item.id === 'review')).toBe(true);
  });
});
