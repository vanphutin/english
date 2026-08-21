import { describe, expect, it } from 'vitest';
import type {
  AutonomousManifest,
  CurriculumLevelSpec,
  CurriculumPointSpec,
} from './manifest-planner.js';
import { Cf4LevelBatchPlanner, type CefrLevel } from './cf4-level-batch-planner.js';

function point(code: string, sortOrder: number): CurriculumPointSpec {
  return {
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
}

function level(cefr: CefrLevel, count: number): CurriculumLevelSpec {
  return {
    cefr,
    titleVi: cefr,
    sortOrder: 1,
    units: [
      {
        code: `${cefr}_U01`,
        titleVi: 'Unit',
        sortOrder: 1,
        points: Array.from({ length: count }, (_, index) =>
          point(`${cefr}_P${index + 1}`, index + 1),
        ),
      },
    ],
  };
}

function manifest(levels: CurriculumLevelSpec[]): AutonomousManifest {
  return {
    schemaVersion: '1.0',
    manifestCode: 'TEST_MANIFEST',
    version: 1,
    policyVersion: 'content-factory-v1',
    status: 'DRAFT',
    levels,
    provenance: {
      origin: 'DETERMINISTIC_TEMPLATE',
      provider: 'none',
      model: 'none',
      promptVersion: 'test',
      generatedAt: '2026-08-21T00:00:00.000Z',
      licenseClass: 'PUBLIC_CONTENT_ORIGINAL',
    },
  };
}

describe('Cf4LevelBatchPlanner', () => {
  it('partitions a level into bounded 3-5 point batches without a tiny tail', () => {
    const result = new Cf4LevelBatchPlanner().plan(manifest([level('A1', 11)]));
    const a1 = result.levels[0]!;

    expect(a1.exerciseTargetPerPoint).toBe(20);
    expect(a1.reviewProfile).toBe('STANDARD');
    expect(a1.batches.map((batch) => batch.points.length)).toEqual([4, 4, 3]);
    expect(a1.batches.every((batch) => batch.requiresRegressionAfterBatch)).toBe(true);
    expect(a1.batches.every((batch) => batch.requiresOwnerApprovalBeforePublish)).toBe(true);
  });

  it('uses enhanced review and 30 exercises per point for C1/C2', () => {
    const result = new Cf4LevelBatchPlanner().plan(manifest([level('C1', 8), level('C2', 8)]));

    for (const advanced of result.levels) {
      expect(advanced.reviewProfile).toBe('ADVANCED');
      expect(advanced.exerciseTargetPerPoint).toBe(30);
      expect(advanced.batches.every((batch) => batch.reviewProfile === 'ADVANCED')).toBe(true);
    }
  });

  it('fails closed on unsafe batch sizes and duplicate codes', () => {
    const planner = new Cf4LevelBatchPlanner();
    expect(() => planner.plan(manifest([level('B1', 8)]), 6)).toThrow(
      'CF4_BATCH_SIZE_MUST_BE_3_TO_5',
    );

    const duplicate = level('B1', 4);
    duplicate.units[0]!.points[3] = { ...duplicate.units[0]!.points[0]! };
    expect(() => planner.plan(manifest([duplicate]))).toThrow(
      'CF4_LEVEL_CONTAINS_DUPLICATE_CODES:B1',
    );
  });
});
