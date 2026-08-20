import type { StoryJourneyView, StoryRepository } from './story-types.js';

export class StoryService {
  constructor(private readonly repository: StoryRepository) {}

  getJourney(userId: string): Promise<StoryJourneyView | null> {
    return this.repository.getJourney(userId);
  }

  chooseBranch(userId: string, sceneId: string, choiceId: string, idempotencyKey: string) {
    return this.repository.chooseBranch(userId, sceneId, choiceId, idempotencyKey);
  }

  continueScene(userId: string, sceneId: string, idempotencyKey: string) {
    return this.repository.continueScene(userId, sceneId, idempotencyKey);
  }

  getSceneExercise(userId: string, sceneId: string): Promise<string | null> {
    return this.repository.getSceneExercise(userId, sceneId);
  }
}
