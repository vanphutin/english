export const REQUIRED_GRAMMAR_DIMENSIONS = [
  'Tense & Aspect',
  'Clause Structure',
  'Questions & Negation',
  'Modality',
  'Conditionals',
  'Voice (Passive & Causative)',
  'Reported Language',
  'Noun Phrase, Determiners & Quantity',
  'Comparison',
  'Complementation (Gerunds & Infinitives)',
  'Relative & Non-finite Clauses',
  'Information Structure (Focus & Inversion)',
  'Discourse Cohesion & Linking',
  'Stance & Hedging',
  'Register & Formality Shift',
  'Ellipsis & Substitution',
  'Counterfactual & Scope Ambiguity',
] as const;

export interface CoverageReport {
  totalPoints: number;
  byCefr: Record<string, number>;
  byDimension: Record<string, number>;
  dimensionPassRate: number;
  coverageDetails: Array<{ dimension: string; count: number; covered: boolean }>;
}

export function generateCoverageMatrix(
  points: Array<{ family?: string; cefr?: string; code?: string }>,
): CoverageReport {
  const byCefr: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  const byDimension: Record<string, number> = {};

  for (const dim of REQUIRED_GRAMMAR_DIMENSIONS) {
    byDimension[dim] = 0;
  }

  for (const p of points) {
    if (p.cefr && byCefr[p.cefr] !== undefined) {
      byCefr[p.cefr] = (byCefr[p.cefr] || 0) + 1;
    }

    const familyUpper = (p.family || '').toUpperCase();

    if (
      familyUpper.includes('TENSE') ||
      familyUpper.includes('ASPECT') ||
      familyUpper.includes('TIME')
    ) {
      byDimension['Tense & Aspect'] = (byDimension['Tense & Aspect'] || 0) + 1;
    }
    if (
      familyUpper.includes('CLAUSE') ||
      familyUpper.includes('STRUCTURE') ||
      familyUpper.includes('SUBORDINATION')
    ) {
      byDimension['Clause Structure'] = (byDimension['Clause Structure'] || 0) + 1;
    }
    if (
      familyUpper.includes('QUESTION') ||
      familyUpper.includes('NEGATION') ||
      familyUpper.includes('PRONOUN')
    ) {
      byDimension['Questions & Negation'] = (byDimension['Questions & Negation'] || 0) + 1;
    }
    if (familyUpper.includes('MODAL')) {
      byDimension['Modality'] = (byDimension['Modality'] || 0) + 1;
    }
    if (familyUpper.includes('CONDITIONAL')) {
      byDimension['Conditionals'] = (byDimension['Conditionals'] || 0) + 1;
    }
    if (familyUpper.includes('PASSIVE') || familyUpper.includes('VOICE')) {
      byDimension['Voice (Passive & Causative)'] =
        (byDimension['Voice (Passive & Causative)'] || 0) + 1;
    }
    if (familyUpper.includes('REPORTED') || familyUpper.includes('SPEECH')) {
      byDimension['Reported Language'] = (byDimension['Reported Language'] || 0) + 1;
    }
    if (
      familyUpper.includes('NOUN') ||
      familyUpper.includes('QUANT') ||
      familyUpper.includes('DETERMINER')
    ) {
      byDimension['Noun Phrase, Determiners & Quantity'] =
        (byDimension['Noun Phrase, Determiners & Quantity'] || 0) + 1;
    }
    if (familyUpper.includes('COMPAR') || familyUpper.includes('SUPERLATIVE')) {
      byDimension['Comparison'] = (byDimension['Comparison'] || 0) + 1;
    }
    if (
      familyUpper.includes('GERUND') ||
      familyUpper.includes('INFINITIVE') ||
      familyUpper.includes('COMPLEMENT')
    ) {
      byDimension['Complementation (Gerunds & Infinitives)'] =
        (byDimension['Complementation (Gerunds & Infinitives)'] || 0) + 1;
    }
    if (familyUpper.includes('RELATIVE') || familyUpper.includes('PARTICIPLE')) {
      byDimension['Relative & Non-finite Clauses'] =
        (byDimension['Relative & Non-finite Clauses'] || 0) + 1;
    }
    if (
      familyUpper.includes('FOCUS') ||
      familyUpper.includes('INVERSION') ||
      familyUpper.includes('CLEFT') ||
      familyUpper.includes('EMPHASIS')
    ) {
      byDimension['Information Structure (Focus & Inversion)'] =
        (byDimension['Information Structure (Focus & Inversion)'] || 0) + 1;
    }
    if (
      familyUpper.includes('DISCOURSE') ||
      familyUpper.includes('COHESION') ||
      familyUpper.includes('LINKING')
    ) {
      byDimension['Discourse Cohesion & Linking'] =
        (byDimension['Discourse Cohesion & Linking'] || 0) + 1;
    }
    if (familyUpper.includes('STANCE') || familyUpper.includes('HEDGING')) {
      byDimension['Stance & Hedging'] = (byDimension['Stance & Hedging'] || 0) + 1;
    }
    if (familyUpper.includes('REGISTER') || familyUpper.includes('FORMAL')) {
      byDimension['Register & Formality Shift'] =
        (byDimension['Register & Formality Shift'] || 0) + 1;
    }
    if (familyUpper.includes('ELLIPSIS') || familyUpper.includes('SUBSTITUTION')) {
      byDimension['Ellipsis & Substitution'] = (byDimension['Ellipsis & Substitution'] || 0) + 1;
    }
    if (
      familyUpper.includes('COUNTERFACTUAL') ||
      familyUpper.includes('SCOPE') ||
      familyUpper.includes('AMBIGUITY')
    ) {
      byDimension['Counterfactual & Scope Ambiguity'] =
        (byDimension['Counterfactual & Scope Ambiguity'] || 0) + 1;
    }
  }

  let coveredCount = 0;
  const coverageDetails = REQUIRED_GRAMMAR_DIMENSIONS.map((dim) => {
    const count = byDimension[dim] || 0;
    const covered = count > 0;
    if (covered) coveredCount++;
    return { dimension: dim, count, covered };
  });

  const dimensionPassRate = Math.round((coveredCount / REQUIRED_GRAMMAR_DIMENSIONS.length) * 100);

  return {
    totalPoints: points.length,
    byCefr,
    byDimension,
    dimensionPassRate,
    coverageDetails,
  };
}
