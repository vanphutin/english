import type { GrammarBundle } from '@english/contracts';

export interface GrammarGraphIssue {
  code: 'MISSING_REFERENCE' | 'PREREQUISITE_CYCLE' | 'SELF_REFERENCE';
  grammarPointCode: string;
  relatedCode?: string;
}

/** Validates reference integrity and the hard prerequisite DAG before publication. */
export function validateGrammarGraph(bundles: readonly GrammarBundle[]): GrammarGraphIssue[] {
  const byCode = new Map(bundles.map((bundle) => [bundle.code, bundle]));
  const issues: GrammarGraphIssue[] = [];
  const allRelationshipKeys = [
    'prerequisites',
    'buildsOn',
    'contrastsWith',
    'oftenConfusedWith',
  ] as const;

  for (const bundle of bundles) {
    for (const key of allRelationshipKeys) {
      for (const relatedCode of bundle.relationships[key]) {
        if (relatedCode === bundle.code) {
          issues.push({ code: 'SELF_REFERENCE', grammarPointCode: bundle.code, relatedCode });
        } else if (!byCode.has(relatedCode)) {
          issues.push({ code: 'MISSING_REFERENCE', grammarPointCode: bundle.code, relatedCode });
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string): void => {
    if (visiting.has(code)) {
      issues.push({ code: 'PREREQUISITE_CYCLE', grammarPointCode: code });
      return;
    }
    if (visited.has(code)) return;
    visiting.add(code);
    for (const prerequisite of byCode.get(code)?.relationships.prerequisites ?? []) {
      if (byCode.has(prerequisite)) visit(prerequisite);
    }
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of byCode.keys()) visit(code);
  return issues;
}
