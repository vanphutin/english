export type ErrorPatternState = 'ACTIVE' | 'IMPROVING' | 'RESOLVED' | 'RECURRED';

export interface ErrorEvidenceEvent {
  type: 'FAILURE' | 'SUCCESS';
  grammarPointId: string;
  category?: string;
  code?: string;
  occurredAt: Date;
  sessionId: string;
  attemptId: string;
}

export interface ProjectedErrorPattern {
  grammarPointId: string;
  category: string;
  code: string;
  state: ErrorPatternState;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastSuccessAt: Date | null;
  representativeAttemptId: string;
}

export interface LearnerErrorPatternView {
  id: string;
  grammarPointId: string;
  grammarCode: string;
  grammarTitle: string;
  category: string;
  code: string;
  state: ErrorPatternState;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  representative: { answer: string; feedbackVi: string; correctedAnswer: string | null };
}

export interface ErrorNotebookView {
  policyVersion: 'error-pattern-v1';
  patterns: LearnerErrorPatternView[];
}

export type UnitChallengeOutcome = 'PASSED' | 'NEEDS_PRACTICE' | 'NO_EVIDENCE';
export interface UnitChallengeTargetView {
  grammarPointId: string;
  grammarCode: string;
  grammarTitle: string;
  outcome: UnitChallengeOutcome;
  disposition: string | null;
  attemptId: string | null;
  reasonCodes: string[];
}
export interface UnitChallengeView {
  id: string;
  unitId: string;
  unitTitle: string;
  sessionId: string;
  status: 'ACTIVE' | 'COMPLETED';
  policyVersion: 'unit-challenge-v1';
  startedAt: string;
  completedAt: string | null;
  targets: UnitChallengeTargetView[];
  remediationGrammarPointIds: string[];
}
export interface UnitChallengePlan {
  challengeId: string;
  sessionId: string;
}

export interface EngagementRepository {
  refreshAndListErrorPatterns(userId: string): Promise<ErrorNotebookView>;
  getOwnedPatternTarget(userId: string, patternId: string): Promise<string | null>;
  getUnitTargetPlan(
    userId: string,
    unitId: string,
  ): Promise<Array<{ id: string; code: string; title: string }> | null>;
  createUnitChallenge(
    userId: string,
    unitId: string,
    sessionId: string,
    targets: Array<{ id: string; code: string; title: string }>,
  ): Promise<UnitChallengePlan>;
  getUnitChallenge(userId: string, challengeId: string): Promise<UnitChallengeView | null>;
}
