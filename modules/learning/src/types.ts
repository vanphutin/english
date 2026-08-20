export interface MasteryView {
  grammarPointId: string;
  code: string;
  title: string;
  band: string;
  masteryScore: number;
  retentionScore: number;
  confidence: number;
  evidenceCount: number;
  nextReviewAt: string | null;
}

export interface ProgressView {
  curriculum: { code: string; version: number };
  currentLevel: { id: string; code: string; cefr: string; title: string };
  requiredPoints: number;
  masteredPoints: number;
  learningPoints: number;
  unseenPoints: number;
  dueReviewPoints: number;
  progressPercent: number;
  roadmap: Array<{
    id: string;
    code: string;
    cefr: string;
    title: string;
    status: 'COMPLETED' | 'CURRENT' | 'LOCKED';
    progressPercent: number;
    units: Array<{
      id: string;
      title: string;
      grammarPoints: Array<{ code: string; title: string }>;
    }>;
  }>;
  nextAction:
    | { type: 'RESUME_SESSION'; sessionId: string }
    | { type: 'START_REVIEW' }
    | { type: 'START_DAILY' };
}

export interface LearningRepository {
  recordEvaluationEvidence(userId: string, attemptId: string): Promise<void>;
  listMastery(userId: string, dueBefore?: Date): Promise<MasteryView[]>;
  getProgress(userId: string): Promise<ProgressView | null>;
}
