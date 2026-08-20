import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contentReviewReportSchema from '../../schemas/content-review-report.schema.json';

export type ReviewDecision = 'PASS' | 'CHANGES_REQUESTED' | 'ESCALATE' | 'REJECT';

export interface ContentReviewReport {
  schemaVersion: '1.0';
  artifactCode: string;
  artifactVersion: number;
  artifactHash: string;
  reviewer: {
    provider: string;
    model: string;
    promptVersion: string;
    runId: string;
  };
  decision: ReviewDecision;
  confidence: number;
  scores: {
    correctness: number;
    specificity: number;
    examples: number;
    vietnamesePedagogy: number;
    cefrFit: number;
    evaluatorReadiness: number;
    originalityDiversity: number;
    provenanceCompleteness: number;
    total: number;
  };
  findings: Array<{
    code: string;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING';
    artifactPath: string;
    messageVi: string;
    evidence: string;
    suggestedAction: string;
    origin: 'DETERMINISTIC' | 'AI_REVIEW';
    validatorVersion: string;
    resolutionStatus: 'OPEN' | 'FIXED' | 'ACCEPTED_WITH_RATIONALE';
  }>;
  reviewedAt: string;
}

export type ContentReviewValidation =
  | { valid: true; value: ContentReviewReport }
  | { valid: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(contentReviewReportSchema);

export function validateContentReviewReport(input: unknown): ContentReviewValidation {
  if (validate(input)) return { valid: true, value: input as ContentReviewReport };
  return {
    valid: false,
    errors: (validate.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    ),
  };
}

/**
 * Applies the non-bypassable quality thresholds from CF review contract.
 * Scores explain readiness; they never override open ERROR/BLOCKING findings.
 */
export function isReviewReadyForOwnerApproval(report: ContentReviewReport): boolean {
  const hasOpenSevereFinding = report.findings.some(
    (finding) =>
      finding.resolutionStatus === 'OPEN' &&
      (finding.severity === 'ERROR' || finding.severity === 'BLOCKING'),
  );
  return (
    report.decision === 'PASS' &&
    report.scores.total >= 88 &&
    report.scores.correctness >= 27 &&
    report.scores.evaluatorReadiness >= 9 &&
    !hasOpenSevereFinding
  );
}
