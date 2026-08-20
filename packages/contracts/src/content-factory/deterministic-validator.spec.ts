import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ContentFactoryValidator } from './deterministic-validator.js';
import { REASON_CODES } from './reason-code-registry.js';
import { generateDryRunReport } from './dry-run-reporter.js';

function loadFixture(filename: string): unknown {
  const filePath = path.resolve(__dirname, '../../fixtures/content-factory', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('ContentFactoryValidator (Phase CF0)', () => {
  const validator = new ContentFactoryValidator();

  it('rejects malformed schema fixtures deterministically', () => {
    const fixture = loadFixture('malformed-schema.json');
    const result = validator.validateManifestArtifact(fixture, 'malformed-schema.json');

    expect(result.valid).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === REASON_CODES.SCHEMA_VALIDATION_FAILED)).toBe(
      true,
    );
  });

  it('rejects cyclic prerequisite graph fixtures deterministically', () => {
    const fixture = loadFixture('cyclic-prerequisites.json');
    const result = validator.validateManifestArtifact(fixture, 'cyclic-prerequisites.json');

    expect(result.valid).toBe(false);
    expect(result.summary.blockingCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === REASON_CODES.GRAPH_CYCLIC_PREREQUISITE)).toBe(
      true,
    );
  });

  it('rejects duplicate item codes in manifest deterministically', () => {
    const fixture = loadFixture('duplicate-stable-code.json');
    const result = validator.validateManifestArtifact(fixture, 'duplicate-stable-code.json');

    expect(result.valid).toBe(false);
    expect(result.summary.blockingCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === REASON_CODES.DUPLICATE_ITEM_CODE)).toBe(true);
  });

  it('rejects mojibake / corrupted UTF-8 text deterministically', () => {
    const fixture = loadFixture('mojibake-utf8.json');
    const result = validator.validateManifestArtifact(fixture, 'mojibake-utf8.json');

    expect(result.valid).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === REASON_CODES.UNICODE_MOJIBAKE_DETECTED)).toBe(
      true,
    );
  });

  it('rejects prompt injection attacks in content deterministically', () => {
    const fixture = loadFixture('prompt-injection.json');
    const result = validator.validateManifestArtifact(fixture, 'prompt-injection.json');

    expect(result.valid).toBe(false);
    expect(result.summary.blockingCount).toBeGreaterThan(0);
    expect(
      result.findings.some((f) => f.code === REASON_CODES.SAFETY_PROMPT_INJECTION_DETECTED),
    ).toBe(true);
  });

  it('rejects missing license declaration deterministically', () => {
    const fixture = loadFixture('missing-license.json');
    const result = validator.validateManifestArtifact(fixture, 'missing-license.json');

    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === REASON_CODES.LICENSE_MISSING_DECLARATION)).toBe(
      true,
    );
  });

  it('rejects answer leakage in exercise context/prompt deterministically', () => {
    const fixture = loadFixture('answer-leakage.json');
    const result = validator.validateExerciseBatchArtifact(fixture, 'answer-leakage.json');

    expect(result.valid).toBe(false);
    expect(result.summary.blockingCount).toBeGreaterThan(0);
    expect(
      result.findings.some((f) => f.code === REASON_CODES.ANSWER_LEAK_IN_PROMPT_OR_CONTEXT),
    ).toBe(true);
  });

  it('accepts valid manifest fixture cleanly', () => {
    const fixture = loadFixture('valid-manifest-sample.json');
    const result = validator.validateManifestArtifact(fixture, 'valid-manifest-sample.json');

    expect(result.valid).toBe(true);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.blockingCount).toBe(0);

    const report = generateDryRunReport({
      runId: 'cf0-dry-run-001',
      phase: 'CF0',
      manifestHash: 'sha256-valid-sample-hash',
      validationResult: result,
      status: 'DRAFT ONLY',
    });

    expect(report).toContain('DRAFT ONLY');
    expect(report).toContain('✅ PASSED');
  });

  it('rejects syntactically valid placeholder lesson content', () => {
    const placeholder = {
      schemaVersion: '1.0',
      code: 'A1_TEST_POINT',
      family: 'TEST',
      version: 1,
      cefr: 'A1',
      status: 'DRAFT',
      title: 'Test point',
      learningObjectiveVi: 'Hiểu điểm kiểm thử này.',
      learningObjectiveEn: 'Understand this test grammar point.',
      form: { patterns: ['subject + verb'] },
      meaning: { uses: ['Use the form in a bounded context.'] },
      usageConstraints: [],
      relationships: { prerequisites: [], buildsOn: [], contrastsWith: [], oftenConfusedWith: [] },
      rules: [
        { code: 'A1_TEST_RULE', type: 'FORM', description: 'Pattern structure for A1_TEST_POINT' },
      ],
      examples: [
        {
          type: 'AFFIRMATIVE',
          english: 'This is a clear illustrative sentence for A1_TEST_POINT.',
          vietnamese: 'Ví dụ.',
          explanationVi: 'Giải thích ví dụ.',
        },
        {
          type: 'NEGATIVE',
          english: 'It is not.',
          vietnamese: 'Không phải.',
          explanationVi: 'Giải thích phủ định.',
        },
        {
          type: 'QUESTION',
          english: 'Is it?',
          vietnamese: 'Có phải không?',
          explanationVi: 'Giải thích câu hỏi.',
        },
      ],
      commonErrors: [
        {
          code: 'A1_TEST_ERR',
          incorrect: 'Wrong.',
          corrected: 'Right.',
          explanationVi: 'Giải thích lỗi.',
          severity: 'MAJOR',
        },
      ],
      generationPolicy: {},
      evaluationPolicy: {},
      provenance: {
        origin: 'AI_GENERATED',
        model: 'test',
        promptVersion: 'test-v1',
        generatedAt: '2026-08-18T00:00:00Z',
      },
      license: 'PUBLIC_CONTENT',
    };
    const result = validator.validateGrammarPointArtifact(placeholder, 'placeholder.json');
    expect(result.valid).toBe(false);
    expect(
      result.findings.some((f) => f.code === REASON_CODES.GRANULARITY_PLACEHOLDER_CONTENT),
    ).toBe(true);
  });
});
