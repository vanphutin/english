export const growthPolicyVersion = 'engagement-growth-v1' as const;

export const approvedInterestTopics = [
  'DAILY_LIFE',
  'FAMILY',
  'STUDY',
  'WORK',
  'TECHNOLOGY',
  'TRAVEL',
  'SHOPPING',
  'HEALTH',
  'FOOD',
  'ENTERTAINMENT',
  'COMMUNITY',
  'NATURE',
  'BUSINESS',
] as const;

export type InterestTopicCode = (typeof approvedInterestTopics)[number];

export const achievementSeeds = [
  {
    code: 'FIRST_INDEPENDENT_SUCCESS',
    titleVi: 'Tự mình làm được',
    descriptionVi: 'Hoàn thành đúng một bài mà không dùng trợ giúp.',
    ruleType: 'INDEPENDENT_SUCCESS_COUNT',
    threshold: 1,
  },
  {
    code: 'GRAMMAR_EXPLORER_5',
    titleVi: 'Nhà thám hiểm ngữ pháp',
    descriptionVi: 'Tự vận dụng đúng 5 điểm ngữ pháp khác nhau.',
    ruleType: 'DISTINCT_INDEPENDENT_GRAMMAR',
    threshold: 5,
  },
  {
    code: 'ERROR_REPAIRER',
    titleVi: 'Sửa lỗi đến cùng',
    descriptionVi: 'Khắc phục một mẫu lỗi từng lặp lại.',
    ruleType: 'RESOLVED_ERROR_COUNT',
    threshold: 1,
  },
  {
    code: 'STORY_FINISHER',
    titleVi: 'Người hoàn thành câu chuyện',
    descriptionVi: 'Hoàn thành một hành trình học qua câu chuyện.',
    ruleType: 'COMPLETED_STORY_COUNT',
    threshold: 1,
  },
] as const;

export function validateInterestTopics(values: string[]): values is InterestTopicCode[] {
  return (
    values.length <= 5 &&
    new Set(values).size === values.length &&
    values.every((value) => approvedInterestTopics.includes(value as InterestTopicCode))
  );
}

/** Returns stable UTC Monday boundaries; persisted reports can always be rebuilt from the same interval. */
export function weekBounds(now: Date): { start: Date; end: Date } {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: date, end };
}
