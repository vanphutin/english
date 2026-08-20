const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message || 'Không thể kết nối với ứng dụng.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const idempotencyKey = (scope: string): string =>
  `${scope}-${crypto.randomUUID()}`.slice(0, 128);

export interface UserView {
  id: string;
  username: string;
  displayName: string;
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

export interface DailyChoiceView {
  type: 'CONTINUE_JOURNEY' | 'REPAIR_WEAKNESS' | 'QUICK_CHALLENGE';
  titleVi: string;
  descriptionVi: string;
  estimatedMinutes: number;
  action: { mode: 'DAILY' | 'REVIEW'; targetMinutes: number };
}

export interface ErrorNotebookView {
  policyVersion: 'error-pattern-v1';
  patterns: Array<{
    id: string;
    grammarPointId: string;
    grammarCode: string;
    grammarTitle: string;
    category: string;
    code: string;
    state: 'ACTIVE' | 'IMPROVING' | 'RESOLVED' | 'RECURRED';
    occurrenceCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
    representative: { answer: string; feedbackVi: string; correctedAnswer: string | null };
  }>;
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
  targets: Array<{
    grammarPointId: string;
    grammarCode: string;
    grammarTitle: string;
    outcome: 'PASSED' | 'NEEDS_PRACTICE' | 'NO_EVIDENCE';
    disposition: string | null;
    attemptId: string | null;
    reasonCodes: string[];
  }>;
  remediationGrammarPointIds: string[];
}

export interface InterestPreferencesView {
  approvedTopics: string[];
  selectedTopics: string[];
}
export interface AchievementView {
  code: string;
  titleVi: string;
  descriptionVi: string;
  granted: boolean;
  grantedAt: string | null;
  evidence: Record<string, unknown> | null;
}
export interface WeeklyReflectionView {
  policyVersion: 'engagement-growth-v1';
  weekStart: string;
  weekEnd: string;
  claims: Array<{ code: string; textVi: string; sourceRefs: string[] }>;
  nextFocus: { reasonCode: string; textVi: string; sourceRefs: string[] };
}
export interface ConsistencyCalendarView {
  policyVersion: 'gentle-consistency-v1';
  days: Array<{ date: string; type: 'LEARNING' | 'REST' | 'EMPTY'; evidenceCount: number }>;
  meaningfulDayCount: number;
  currentRhythm: number;
  bestRhythm: number;
  messageVi: string;
}
export interface DailySurpriseView {
  date: string;
  contentKey: string;
  cefr: string;
  type: string;
  titleVi: string;
  bodyVi: string;
  topicCode: string;
  optional: true;
}

export interface StoryJourneyView {
  series: { id: string; code: string; title: string; description: string; cefr: string };
  status: 'ACTIVE' | 'COMPLETED';
  completedSceneCount: number;
  totalSceneCount: number;
  currentScene: null | {
    id: string;
    code: string;
    chapterTitle: string;
    title: string;
    narrativeVi: string;
    dialogue: Array<{ speaker: string; text: string }>;
    choices: Array<{ id: string; code: string; labelVi: string }>;
    hasDefaultContinuation: boolean;
    hasLearningAction: boolean;
    exerciseId: string | null;
  };
  memoryFacts: Array<{ key: string; value: string }>;
}

export interface ExerciseView {
  sessionItemId: string;
  exerciseId: string;
  type: string;
  contextVi: string;
  instructionVi: string;
  sourceTextVi: string;
  promptPayload: Record<string, unknown>;
  targets: Array<{
    code: string;
    title: string;
    cefr: string;
    learningObjectiveVi: string;
    formPatterns: string[];
    meaningUses: string[];
    usageNotes: string[];
    rules: Array<{ code: string; type: string; description: string }>;
    examples: Array<{
      type: string;
      english: string;
      vietnamese: string;
      explanationVi: string;
    }>;
  }>;
  attemptLimit: number;
}

export interface SessionSummary {
  sessionId: string;
  completedAt: string;
  totalItems: number;
  completedItems: number;
  acceptedItems: number;
  retryItems: number;
  durationSeconds: number;
}

export interface SessionState {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
  completedAt: string | null;
  progress: { total: number; completed: number; remaining: number };
  currentItem: ExerciseView | null;
  summary: SessionSummary | null;
}

export interface AttemptView {
  attemptId: string;
  status: string;
  evaluation?: {
    disposition: 'ACCEPT' | 'ACCEPT_WITH_FEEDBACK' | 'RETRY' | 'SYSTEM_REVIEW';
    dimensions: Record<string, string>;
    feedbackVi: string;
    findings: Array<{
      category: string;
      severity: string;
      messageVi: string;
      suggestedFix?: string;
    }>;
    correctedAnswer?: string;
    canRetry: boolean;
  };
}

export interface VocabularyHintView {
  id: string;
  level: number;
  textVi: string;
  lemma: string | null;
  partOfSpeech: string | null;
  revealedAt: string;
  hasMore: boolean;
}
