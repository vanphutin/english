export type SessionMode = 'DAILY' | 'FOCUSED' | 'REVIEW';
export interface StartSessionInput {
  mode: SessionMode;
  grammarPointIds?: string[];
  targetMinutes?: number;
  /** Internal curated-content pin; public session DTO does not expose this selector. */
  exerciseIds?: string[];
}
export type DailyChoiceType = 'CONTINUE_JOURNEY' | 'REPAIR_WEAKNESS' | 'QUICK_CHALLENGE';
export interface DailyChoiceView {
  type: DailyChoiceType;
  titleVi: string;
  descriptionVi: string;
  estimatedMinutes: number;
  action: { mode: 'DAILY' | 'REVIEW'; targetMinutes: number };
}
export interface SessionView {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
}
export interface SessionStateView extends SessionView {
  completedAt: string | null;
  progress: { total: number; completed: number; remaining: number };
  currentItem: ExerciseView | null;
  summary: SessionSummaryView | null;
}
export interface SessionSummaryView {
  sessionId: string;
  completedAt: string;
  totalItems: number;
  completedItems: number;
  acceptedItems: number;
  retryItems: number;
  durationSeconds: number;
}
export interface ExerciseView {
  sessionItemId: string;
  exerciseId: string;
  type: string;
  contextVi: string;
  instructionVi: string;
  sourceTextVi: string;
  promptPayload: Record<string, unknown>;
  targets: GrammarTargetView[];
  attemptLimit: number;
}
export interface GrammarTargetView {
  code: string;
  title: string;
  cefr: string;
  learningObjectiveVi: string;
  formPatterns: string[];
  meaningUses: string[];
  usageNotes: string[];
  rules: Array<{ code: string; type: string; description: string }>;
  examples: Array<{ type: string; english: string; vietnamese: string; explanationVi: string }>;
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
export interface PracticeRepository {
  getDailyChoices(userId: string): Promise<DailyChoiceView[]>;
  startSession(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    input: StartSessionInput,
  ): Promise<SessionView>;
  getNext(userId: string, sessionId: string): Promise<ExerciseView | null>;
  getSession(userId: string, sessionId: string): Promise<SessionStateView | null>;
  listRevealedHints(userId: string, itemId: string): Promise<VocabularyHintView[]>;
  revealNextHint(userId: string, itemId: string): Promise<VocabularyHintView | null>;
  completeSession(
    userId: string,
    sessionId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<SessionSummaryView>;
}
