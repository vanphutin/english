import { describe, expect, it } from 'vitest';
import type { CurriculumPointSpec } from './manifest-planner.js';
import type { Cf4BatchPoint, Cf4LevelBatch } from './cf4-level-batch-planner.js';
import {
  Cf4BatchRegressionValidator,
  type Cf4RegressionPointEvidence,
} from './cf4-batch-regression.js';

function point(code: string, sortOrder: number): Cf4BatchPoint {
  const base: CurriculumPointSpec = {
    code,
    family: 'TEST',
    canonicalSlug: code.toLowerCase(),
    titleVi: code,
    titleEn: code,
    assessableDistinction: `Distinction for ${code}`,
    communicativeFunctions: ['test'],
    formBoundary: 'bounded form',
    meaningBoundary: 'bounded meaning',
    useBoundary: 'bounded use',
    prerequisites: [],
    buildsOn: [],
    contrastsWith: [],
    oftenConfusedWith: [],
    vocabularyDomains: ['GENERAL'],
    rationale: 'test fixture',
    sortOrder,
  };
  return { ...base, cefr: 'C1', unitCode: 'C1_U01' };
}

function batch(): Cf4LevelBatch {
  return {
    batchCode: 'C1-CF4-01',
    cefr: 'C1',
    batchIndex: 1,
    plannedMaximumBatchSize: 5,
    reviewProfile: 'ADVANCED',
    exerciseTargetPerPoint: 30,
    requiresRegressionAfterBatch: true,
    requiresOwnerApprovalBeforePublish: true,
    points: [point('C1_P1', 1), point('C1_P2', 2), point('C1_P3', 3)],
  };
}

function readyEvidence(code: string, suffix: string): Cf4RegressionPointEvidence {
  return {
    code,
    status: 'READY_FOR_APPROVAL',
    reviewProfile: 'ADVANCED',
    grammarHash: `grammar-${suffix}`,
    exerciseHash: `exercise-${suffix}`,
    exerciseCount: 30,
    errorCode: null,
  };
}

describe('Cf4BatchRegressionValidator', () => {
  it('passes only complete evidence for the exact batch', () => {
    const target = batch();
    const report = new Cf4BatchRegressionValidator().validate(target, [
      readyEvidence('C1_P1', '1'),
      readyEvidence('C1_P2', '2'),
      readyEvidence('C1_P3', '3'),
    ]);

    expect(report.passed).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it('fails closed when advanced review or exercise quota is missing', () => {
    const target = batch();
    const broken = readyEvidence('C1_P2', '2');
    broken.reviewProfile = 'STANDARD';
    broken.exerciseCount = 12;

    const report = new Cf4BatchRegressionValidator().validate(target, [
      readyEvidence('C1_P1', '1'),
      broken,
      readyEvidence('C1_P3', '3'),
    ]);

    expect(report.passed).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(
      'CF4_REGRESSION_ADVANCED_REVIEW_MISSING',
    );
    expect(report.findings.map((finding) => finding.code)).toContain(
      'CF4_REGRESSION_EXERCISE_TARGET_MISMATCH',
    );
  });

  it('rejects duplicate generated outputs across different targets', () => {
    const target = batch();
    const first = readyEvidence('C1_P1', 'same');
    const second = readyEvidence('C1_P2', 'same');
    const third = readyEvidence('C1_P3', '3');
    const report = new Cf4BatchRegressionValidator().validate(target, [first, second, third]);

    expect(report.passed).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(
      'CF4_REGRESSION_DUPLICATE_GRAMMAR_HASH',
    );
    expect(report.findings.map((finding) => finding.code)).toContain(
      'CF4_REGRESSION_DUPLICATE_EXERCISE_HASH',
    );
  });
});
