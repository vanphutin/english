import { describe, expect, it } from 'vitest';
import { ContentFactoryValidator } from '@english/contracts';
import { ManifestPlanner } from './manifest-planner.js';

describe('ManifestPlanner (Phase CF2 Manifest Planner)', () => {
  const planner = new ManifestPlanner();
  const validator = new ContentFactoryValidator();

  it('generates a full 235-point curriculum manifest within the 230-265 envelope target', () => {
    const result = planner.generateFullAutonomousManifest();

    expect(result.totalPointsCount).toBe(235);
    expect(result.totalPointsCount).toBeGreaterThanOrEqual(230);
    expect(result.totalPointsCount).toBeLessThanOrEqual(265);
    expect(result.manifest.levels.length).toBe(6);
  });

  it('preserves 100% of the 62 published stable codes from personal-english.v4.json', () => {
    const result = planner.generateFullAutonomousManifest();

    expect(result.publishedStableCodesPreservedCount).toBe(62);
  });

  it('conforms strictly to curriculum-manifest.schema.json deterministically', () => {
    const result = planner.generateFullAutonomousManifest();
    const validationResult = validator.validateManifestArtifact(
      result.manifest,
      'autonomous-manifest-draft.json',
    );

    expect(validationResult.valid).toBe(true);
    expect(validationResult.summary.errorCount).toBe(0);
    expect(validationResult.summary.blockingCount).toBe(0);
  });

  it('ensures prerequisite graph is an acyclic DAG with 0 cycles', () => {
    const result = planner.generateFullAutonomousManifest();
    const validationResult = validator.validateManifestArtifact(
      result.manifest,
      'autonomous-manifest-draft.json',
    );

    const cycleFindings = validationResult.findings.filter(
      (f) => f.code === 'GRAPH_CYCLIC_PREREQUISITE',
    );
    expect(cycleFindings.length).toBe(0);
  });

  it('achieves 100% pass rate across all 17 required grammar coverage dimensions', () => {
    const result = planner.generateFullAutonomousManifest();
    const report = result.coverageReport;

    expect(report.dimensionPassRate).toBe(100);
    expect(report.coverageDetails.every((d) => d.covered)).toBe(true);
  });
});
