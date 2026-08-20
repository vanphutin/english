import type { GrammarBundle } from '@english/contracts';
import { describe, expect, it } from 'vitest';
import { validateGrammarGraph } from './grammar-graph.js';

const bundle = (code: string, prerequisites: string[] = []): GrammarBundle => ({
  schemaVersion: '1.0',
  code,
  family: 'BASIC',
  version: 1,
  cefr: 'A1',
  status: 'DRAFT',
  title: code,
  learningObjectiveVi: 'Mục tiêu học tập hợp lệ',
  learningObjectiveEn: 'A valid learning objective',
  form: { patterns: ['subject + verb'] },
  meaning: { uses: ['a valid grammar use'] },
  usageConstraints: [],
  relationships: { prerequisites, buildsOn: [], contrastsWith: [], oftenConfusedWith: [] },
  rules: [{ code: 'RULE_ONE', type: 'FORM', description: 'A valid rule' }],
  examples: [],
  commonErrors: [],
  generationPolicy: {},
  evaluationPolicy: {},
  provenance: {
    origin: 'AI_GENERATED',
    model: 'fixture',
    promptVersion: '1',
    generatedAt: '2026-08-16T00:00:00Z',
  },
});

describe('validateGrammarGraph', () => {
  it('reports missing references', () => {
    expect(validateGrammarGraph([bundle('A', ['MISSING'])])).toContainEqual({
      code: 'MISSING_REFERENCE',
      grammarPointCode: 'A',
      relatedCode: 'MISSING',
    });
  });
  it('reports prerequisite cycles', () => {
    expect(
      validateGrammarGraph([bundle('A', ['B']), bundle('B', ['A'])]).some(
        (issue) => issue.code === 'PREREQUISITE_CYCLE',
      ),
    ).toBe(true);
  });
});
