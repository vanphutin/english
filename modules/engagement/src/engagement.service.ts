import type {
  EngagementRepository,
  ErrorNotebookView,
  UnitChallengePlan,
  UnitChallengeView,
} from './types.js';

export class EngagementService {
  constructor(private readonly repository: EngagementRepository) {}

  getErrorNotebook(userId: string): Promise<ErrorNotebookView> {
    return this.repository.refreshAndListErrorPatterns(userId);
  }

  getOwnedPatternTarget(userId: string, patternId: string): Promise<string | null> {
    return this.repository.getOwnedPatternTarget(userId, patternId);
  }

  async getUnitTargetPlan(userId: string, unitId: string) {
    return this.repository.getUnitTargetPlan(userId, unitId);
  }

  createUnitChallenge(
    userId: string,
    unitId: string,
    sessionId: string,
    targets: Array<{ id: string; code: string; title: string }>,
  ): Promise<UnitChallengePlan> {
    return this.repository.createUnitChallenge(userId, unitId, sessionId, targets);
  }

  getUnitChallenge(userId: string, challengeId: string): Promise<UnitChallengeView | null> {
    return this.repository.getUnitChallenge(userId, challengeId);
  }
}
