export type SelectionBucket = 'CURRENT_CURRICULUM' | 'DUE_REVIEW' | 'WEAK_TARGET';
export interface SelectionCandidate {
  id: string;
  bucket: SelectionBucket;
  groupKey?: string;
  activityType?: string;
  semanticHash?: string;
  topicCode?: string;
  recentlyUsed?: boolean;
  preferredTopic?: boolean;
}

const seededScore = (value: string, seed: string): number => {
  let hash = 2166136261;
  for (const character of `${seed}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Applies the approved 40/35/25 mix, reallocating empty buckets without duplicating exercises. */
export const selectSessionExercises = (
  candidates: SelectionCandidate[],
  count: number,
  reviewOnly = false,
  seed = 'session-selection-v2',
): SelectionCandidate[] => {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const fresh = unique.filter((candidate) => !candidate.recentlyUsed);
  const pool = (fresh.length >= count ? fresh : unique).sort(
    (left, right) => seededScore(left.id, seed) - seededScore(right.id, seed),
  );
  const quotas: Record<SelectionBucket, number> = reviewOnly
    ? {
        CURRENT_CURRICULUM: 0,
        DUE_REVIEW: Math.ceil(count * 0.6),
        WEAK_TARGET: Math.floor(count * 0.4),
      }
    : {
        CURRENT_CURRICULUM: Math.ceil(count * 0.4),
        DUE_REVIEW: Math.floor(count * 0.35),
        WEAK_TARGET: 0,
      };
  quotas.WEAK_TARGET = count - quotas.CURRENT_CURRICULUM - quotas.DUE_REVIEW;
  const selected: SelectionCandidate[] = [];
  const takeFrom = (bucket: SelectionBucket, limit: number): void => {
    let added = 0;
    const candidatesInBucket = pool.filter(
      (item) =>
        item.bucket === bucket &&
        !selected.some(
          (chosen) =>
            chosen.id === item.id ||
            (item.semanticHash && chosen.semanticHash === item.semanticHash),
        ),
    );
    while (added < limit) {
      const available = candidatesInBucket.filter(
        (item) =>
          !selected.some(
            (chosen) =>
              chosen.id === item.id ||
              (item.semanticHash && chosen.semanticHash === item.semanticHash),
          ),
      );
      if (available.length === 0) break;
      const usedTypes = new Set(selected.map((item) => item.activityType).filter(Boolean));
      const usedGroups = new Set(selected.map((item) => item.groupKey).filter(Boolean));
      const usedTopics = new Set(selected.map((item) => item.topicCode).filter(Boolean));
      available.sort((left, right) => {
        const penalty = (item: SelectionCandidate): number =>
          (item.activityType && usedTypes.has(item.activityType) ? 100 : 0) +
          (item.groupKey && usedGroups.has(item.groupKey) ? 20 : 0) +
          (item.topicCode && usedTopics.has(item.topicCode) ? 5 : 0);
        const preference = (item: SelectionCandidate): number => (item.preferredTopic ? -2 : 0);
        return (
          penalty(left) + preference(left) - penalty(right) - preference(right) ||
          seededScore(left.id, seed) - seededScore(right.id, seed)
        );
      });
      selected.push(available[0]!);
      added += 1;
    }
  };
  takeFrom('DUE_REVIEW', quotas.DUE_REVIEW);
  takeFrom('WEAK_TARGET', quotas.WEAK_TARGET);
  takeFrom('CURRENT_CURRICULUM', quotas.CURRENT_CURRICULUM);
  for (const bucket of ['DUE_REVIEW', 'WEAK_TARGET', 'CURRENT_CURRICULUM'] as const)
    takeFrom(bucket, count - selected.length);
  const remaining = selected.slice(0, count);
  const ordered: SelectionCandidate[] = [];
  while (remaining.length > 0) {
    const last = ordered.at(-1)?.activityType;
    const repeatedTwice = last && ordered.at(-2)?.activityType === last;
    const allowed = remaining
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !repeatedTwice || item.activityType !== last);
    const candidates =
      allowed.length > 0 ? allowed : remaining.map((item, index) => ({ item, index }));
    const remainingCount = (type: string | undefined): number =>
      remaining.filter((item) => item.activityType === type).length;
    candidates.sort(
      (left, right) =>
        remainingCount(right.item.activityType) - remainingCount(left.item.activityType),
    );
    ordered.push(remaining.splice(candidates[0]!.index, 1)[0]!);
  }
  return ordered;
};
