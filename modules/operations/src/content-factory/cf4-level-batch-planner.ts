import type {
  AutonomousManifest,
  CurriculumPointSpec,
} from './manifest-planner.js';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Cf4ReviewProfile = 'STANDARD' | 'ADVANCED';

export interface Cf4BatchPoint extends CurriculumPointSpec {
  cefr: CefrLevel;
  unitCode: string;
}

export interface Cf4LevelBatch {
  batchCode: string;
  cefr: CefrLevel;
  batchIndex: number;
  reviewProfile: Cf4ReviewProfile;
  exerciseTargetPerPoint: number;
  requiresRegressionAfterBatch: true;
  requiresOwnerApprovalBeforePublish: true;
  points: Cf4BatchPoint[];
}

export interface Cf4LevelPlan {
  cefr: CefrLevel;
  totalPoints: number;
  batchCount: number;
  reviewProfile: Cf4ReviewProfile;
  exerciseTargetPerPoint: number;
  batches: Cf4LevelBatch[];
}

export interface Cf4BatchPlan {
  schemaVersion: '1.0';
  phase: 'CF4';
  manifestCode: string;
  manifestVersion: number;
  levels: Cf4LevelPlan[];
}

const EXERCISE_TARGETS: Record<CefrLevel, number> = {
  A1: 20,
  A2: 20,
  B1: 24,
  B2: 24,
  C1: 30,
  C2: 30,
};

/**
 * Deterministically converts an approved CF2 manifest into bounded CF4 work.
 * This class plans work only: it cannot author, approve, activate, or publish.
 */
export class Cf4LevelBatchPlanner {
  public plan(manifest: AutonomousManifest, maximumBatchSize = 5): Cf4BatchPlan {
    if (maximumBatchSize < 3 || maximumBatchSize > 5) {
      throw new Error('CF4_BATCH_SIZE_MUST_BE_3_TO_5');
    }

    const levels = manifest.levels.map((level) => {
      const cefr = level.cefr;
      const points = level.units.flatMap((unit) =>
        [...unit.points]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((point) => ({ ...point, cefr, unitCode: unit.code })),
      );
      this.assertUniqueCodes(points, cefr);
      if (points.length < 3) throw new Error(`CF4_LEVEL_TOO_SMALL:${cefr}`);

      const reviewProfile: Cf4ReviewProfile =
        cefr === 'C1' || cefr === 'C2' ? 'ADVANCED' : 'STANDARD';
      const exerciseTargetPerPoint = EXERCISE_TARGETS[cefr];
      const sizes = this.partition(points.length, maximumBatchSize);
      let offset = 0;
      const batches = sizes.map((size, index): Cf4LevelBatch => {
        const batchPoints = points.slice(offset, offset + size);
        offset += size;
        return {
          batchCode: `${cefr}-CF4-${String(index + 1).padStart(2, '0')}`,
          cefr,
          batchIndex: index + 1,
          reviewProfile,
          exerciseTargetPerPoint,
          requiresRegressionAfterBatch: true,
          requiresOwnerApprovalBeforePublish: true,
          points: batchPoints,
        };
      });

      return {
        cefr,
        totalPoints: points.length,
        batchCount: batches.length,
        reviewProfile,
        exerciseTargetPerPoint,
        batches,
      };
    });

    const allCodes = levels.flatMap((level) =>
      level.batches.flatMap((batch) => batch.points.map((point) => point.code)),
    );
    if (new Set(allCodes).size !== allCodes.length) {
      throw new Error('CF4_MANIFEST_CONTAINS_DUPLICATE_CODES');
    }

    return {
      schemaVersion: '1.0',
      phase: 'CF4',
      manifestCode: manifest.manifestCode,
      manifestVersion: manifest.version,
      levels,
    };
  }

  private partition(total: number, maximumBatchSize: number): number[] {
    const batchCount = Math.ceil(total / maximumBatchSize);
    const baseSize = Math.floor(total / batchCount);
    const remainder = total % batchCount;
    if (baseSize < 3) throw new Error('CF4_CANNOT_FORM_SAFE_BATCHES');

    return Array.from({ length: batchCount }, (_, index) =>
      baseSize + (index < remainder ? 1 : 0),
    );
  }

  private assertUniqueCodes(points: Cf4BatchPoint[], cefr: CefrLevel): void {
    const codes = points.map((point) => point.code);
    if (new Set(codes).size !== codes.length) {
      throw new Error(`CF4_LEVEL_CONTAINS_DUPLICATE_CODES:${cefr}`);
    }
  }
}
