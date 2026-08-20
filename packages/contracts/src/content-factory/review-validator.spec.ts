import { describe, expect, it } from 'vitest';
import {
  isReviewReadyForOwnerApproval,
  validateContentReviewReport,
  type ContentReviewReport,
} from './review-validator.js';

function report(): ContentReviewReport {
  return {
    schemaVersion: '1.0',
    artifactCode: 'A1_REVIEW_GATE',
    artifactVersion: 1,
    artifactHash: 'a'.repeat(64),
    reviewer: {
      provider: 'SECONDARY_OPENAI_COMPATIBLE',
      model: 'reviewer-model',
      promptVersion: 'cf3-independent-review-v1',
      runId: '11111111-1111-4111-8111-111111111111',
    },
    decision: 'PASS',
    confidence: 0.95,
    scores: {
      correctness: 30,
      specificity: 14,
      examples: 14,
      vietnamesePedagogy: 10,
      cefrFit: 10,
      evaluatorReadiness: 10,
      originalityDiversity: 4,
      provenanceCompleteness: 4,
      total: 96,
    },
    findings: [],
    reviewedAt: '2026-08-20T00:00:00.000Z',
  };
}

describe('content review readiness', () => {
  it('accepts a schema-valid high-scoring PASS with no actionable findings', () => {
    const input = report();
    expect(validateContentReviewReport(input).valid).toBe(true);
    expect(isReviewReadyForOwnerApproval(input)).toBe(true);
  });

  it('blocks an unresolved warning until repaired or explicitly accepted with rationale', () => {
    const input = report();
    input.findings.push({
      code: 'CEFR_REVIEW_WARNING',
      severity: 'WARNING',
      artifactPath: 'A1_REVIEW_GATE.v1.json',
      messageVi: 'Một ví dụ có thể vượt trần từ vựng A1 và cần được xem xét.',
      evidence: 'Reviewer flagged one lexical choice.',
      suggestedAction: 'Thay từ hoặc chấp nhận với rationale rõ ràng.',
      origin: 'AI_REVIEW',
      validatorVersion: 'cf3-independent-review-v1',
      resolutionStatus: 'OPEN',
    });

    expect(isReviewReadyForOwnerApproval(input)).toBe(false);
    input.findings[0]!.resolutionStatus = 'ACCEPTED_WITH_RATIONALE';
    expect(isReviewReadyForOwnerApproval(input)).toBe(true);
  });

  it('does not let a PASS decision bypass correctness or evaluator thresholds', () => {
    const input = report();
    input.scores.correctness = 26;
    expect(isReviewReadyForOwnerApproval(input)).toBe(false);
    input.scores.correctness = 30;
    input.scores.evaluatorReadiness = 8;
    expect(isReviewReadyForOwnerApproval(input)).toBe(false);
  });
});
