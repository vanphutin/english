import { createHash } from 'node:crypto';
import type {
  DailyChoiceView,
  ExerciseView,
  PracticeRepository,
  SessionStateView,
  SessionSummaryView,
  SessionView,
  StartSessionInput,
  VocabularyHintView,
} from './types.js';
export class PracticeService {
  constructor(private readonly repository: PracticeRepository) {}
  getDailyChoices(userId: string): Promise<DailyChoiceView[]> {
    return this.repository.getDailyChoices(userId);
  }
  /** A stable request hash makes network retries safe and detects key reuse with changed intent. */
  async startSession(
    userId: string,
    idempotencyKey: string,
    input: StartSessionInput,
  ): Promise<SessionView> {
    const normalized = {
      mode: input.mode,
      grammarPointIds: [...(input.grammarPointIds ?? [])].sort(),
      exerciseIds: [...(input.exerciseIds ?? [])].sort(),
      targetMinutes: input.targetMinutes ?? 10,
    };
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return this.repository.startSession(userId, idempotencyKey, hash, normalized);
  }
  async getNext(userId: string, sessionId: string): Promise<ExerciseView | null> {
    return this.repository.getNext(userId, sessionId);
  }
  getSession(userId: string, sessionId: string): Promise<SessionStateView | null> {
    return this.repository.getSession(userId, sessionId);
  }
  listRevealedHints(userId: string, itemId: string): Promise<VocabularyHintView[]> {
    return this.repository.listRevealedHints(userId, itemId);
  }
  revealNextHint(userId: string, itemId: string): Promise<VocabularyHintView | null> {
    return this.repository.revealNextHint(userId, itemId);
  }
  /** Completion has no body, but hashing the target prevents one key from completing two sessions. */
  completeSession(
    userId: string,
    sessionId: string,
    idempotencyKey: string,
  ): Promise<SessionSummaryView> {
    const hash = createHash('sha256').update(JSON.stringify({ sessionId })).digest('hex');
    return this.repository.completeSession(userId, sessionId, idempotencyKey, hash);
  }
}
