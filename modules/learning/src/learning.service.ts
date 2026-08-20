import type { LearningRepository, MasteryView, ProgressView } from './types.js';

export class LearningService {
  constructor(private readonly repository: LearningRepository) {}
  recordEvaluationEvidence(userId: string, attemptId: string): Promise<void> {
    return this.repository.recordEvaluationEvidence(userId, attemptId);
  }
  listMastery(userId: string, dueBefore?: Date): Promise<MasteryView[]> {
    return this.repository.listMastery(userId, dueBefore);
  }
  getProgress(userId: string): Promise<ProgressView | null> {
    return this.repository.getProgress(userId);
  }
}
