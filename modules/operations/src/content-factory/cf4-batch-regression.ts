import type { Cf4LevelBatch, Cf4ReviewProfile } from './cf4-level-batch-planner.js';

export interface Cf4RegressionPointEvidence {
  code: string;
  status: 'READY_FOR_APPROVAL' | 'CHANGES_REQUESTED' | 'QUARANTINED';
  reviewProfile: Cf4ReviewProfile | null;
  grammarHash: string | null;
  exerciseHash: string | null;
  exerciseCount: number;
  errorCode: string | null;
}

export interface Cf4RegressionFinding {
  code: string;
  targetCode?: string;
  message: string;
}

export interface Cf4BatchRegressionReport {
  schemaVersion: '1.0';
  phase: 'CF4';
  batchCode: string;
  cefr: Cf4LevelBatch['cefr'];
  passed: boolean;
  checkedPointCount: number;
  findings: Cf4RegressionFinding[];
}

/**
 * Deterministic regression gate executed after every CF4 sub-batch. It does not
 * decide linguistic correctness; that is already owned by deterministic artifact
 * validation + independent review. This gate catches orchestration regressions:
 * missing/extra targets, incomplete gates, wrong exercise quotas, duplicate output
 * hashes, and missing enhanced review on C1/C2.
 */
export class Cf4BatchRegressionValidator {
  public validate(
    batch: Cf4LevelBatch,
    points: Cf4RegressionPointEvidence[],
  ): Cf4BatchRegressionReport {
    const findings: Cf4RegressionFinding[] = [];
    const expectedCodes = batch.points.map((point) => point.code);
    const actualCodes = points.map((point) => point.code);

    if (
      expectedCodes.length !== actualCodes.length ||
      expectedCodes.some((code, index) => actualCodes[index] !== code)
    ) {
      findings.push({
        code: 'CF4_REGRESSION_SCOPE_MISMATCH',
        message: 'Regression evidence does not match the exact deterministic batch scope/order.',
      });
    }

    for (const point of points) {
      if (point.status !== 'READY_FOR_APPROVAL') {
        findings.push({
          code: 'CF4_REGRESSION_POINT_NOT_READY',
          targetCode: point.code,
          message: `Point ended in ${point.status}.`,
        });
      }
      if (!point.grammarHash || !point.exerciseHash) {
        findings.push({
          code: 'CF4_REGRESSION_OUTPUT_HASH_MISSING',
          targetCode: point.code,
          message: 'Grammar or exercise output hash is missing.',
        });
      }
      if (point.exerciseCount !== batch.exerciseTargetPerPoint) {
        findings.push({
          code: 'CF4_REGRESSION_EXERCISE_TARGET_MISMATCH',
          targetCode: point.code,
          message: `Expected ${batch.exerciseTargetPerPoint} exercises but observed ${point.exerciseCount}.`,
        });
      }
      if (point.errorCode) {
        findings.push({
          code: 'CF4_REGRESSION_POINT_ERROR_PRESENT',
          targetCode: point.code,
          message: `Point retains error code ${point.errorCode}.`,
        });
      }
      if (batch.reviewProfile === 'ADVANCED' && point.reviewProfile !== 'ADVANCED') {
        findings.push({
          code: 'CF4_REGRESSION_ADVANCED_REVIEW_MISSING',
          targetCode: point.code,
          message: 'C1/C2 point did not carry ADVANCED independent review evidence.',
        });
      }
    }

    const grammarHashes = points.flatMap((point) => (point.grammarHash ? [point.grammarHash] : []));
    if (new Set(grammarHashes).size !== grammarHashes.length) {
      findings.push({
        code: 'CF4_REGRESSION_DUPLICATE_GRAMMAR_HASH',
        message: 'Two targets produced the same grammar output hash.',
      });
    }
    const exerciseHashes = points.flatMap((point) =>
      point.exerciseHash ? [point.exerciseHash] : [],
    );
    if (new Set(exerciseHashes).size !== exerciseHashes.length) {
      findings.push({
        code: 'CF4_REGRESSION_DUPLICATE_EXERCISE_HASH',
        message: 'Two targets produced the same exercise-bank output hash.',
      });
    }

    return {
      schemaVersion: '1.0',
      phase: 'CF4',
      batchCode: batch.batchCode,
      cefr: batch.cefr,
      passed: findings.length === 0,
      checkedPointCount: points.length,
      findings,
    };
  }
}
