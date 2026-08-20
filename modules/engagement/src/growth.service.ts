import { validateInterestTopics } from './growth-policy.js';
import type { GrowthRepository } from './growth-types.js';

export class GrowthService {
  constructor(private readonly repository: GrowthRepository) {}
  getInterests(userId: string) {
    return this.repository.getInterests(userId);
  }
  updateInterests(userId: string, topics: string[]) {
    if (!validateInterestTopics(topics)) throw new Error('INVALID_INTEREST_TOPICS');
    return this.repository.replaceInterests(userId, topics);
  }
  getAchievements(userId: string) {
    return this.repository.refreshAchievements(userId);
  }
  getWeeklyReflection(userId: string) {
    return this.repository.generateWeeklyReflection(userId);
  }
}
