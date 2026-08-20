import { createHash } from 'node:crypto';
import type { AttemptView, SubmitAttemptInput } from './types.js';

export interface EvaluationRepository {
  submit(
    userId: string,
    itemId: string,
    idempotencyKey: string,
    requestHash: string,
    input: SubmitAttemptInput,
  ): Promise<AttemptView>;
  get(userId: string, attemptId: string): Promise<AttemptView | null>;
}

export class EvaluationService {
  constructor(private readonly repository: EvaluationRepository) {}

  submit(
    userId: string,
    itemId: string,
    idempotencyKey: string,
    input: SubmitAttemptInput,
  ): Promise<AttemptView> {
    const normalized = input.answer.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const canonical = JSON.stringify({
      answer: normalized,
      clientSubmittedAt: input.clientSubmittedAt ?? null,
    });
    const requestHash = createHash('sha256').update(canonical).digest('hex');
    return this.repository.submit(userId, itemId, idempotencyKey, requestHash, {
      ...input,
      answer: normalized,
    });
  }

  get(userId: string, attemptId: string): Promise<AttemptView | null> {
    return this.repository.get(userId, attemptId);
  }
}
