import type { InterestTopicCode } from './growth-policy.js';

export interface InterestPreferencesView {
  approvedTopics: readonly string[];
  selectedTopics: InterestTopicCode[];
}
export interface AchievementView {
  code: string;
  titleVi: string;
  descriptionVi: string;
  granted: boolean;
  grantedAt: string | null;
  evidence: Record<string, unknown> | null;
}
export interface WeeklyClaim {
  code: string;
  textVi: string;
  sourceRefs: string[];
}
export interface WeeklyReflectionView {
  policyVersion: 'engagement-growth-v1';
  weekStart: string;
  weekEnd: string;
  claims: WeeklyClaim[];
  nextFocus: { reasonCode: string; textVi: string; sourceRefs: string[] };
}
export interface GrowthRepository {
  getInterests(userId: string): Promise<InterestPreferencesView>;
  replaceInterests(userId: string, topics: InterestTopicCode[]): Promise<InterestPreferencesView>;
  refreshAchievements(userId: string): Promise<AchievementView[]>;
  generateWeeklyReflection(userId: string, now?: Date): Promise<WeeklyReflectionView>;
}
