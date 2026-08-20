export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type GrammarContentStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';

export interface GrammarBundle {
  schemaVersion: '1.0';
  code: string;
  family: string;
  version: number;
  cefr: CefrLevel;
  status: GrammarContentStatus;
  title: string;
  learningObjectiveVi: string;
  learningObjectiveEn: string;
  form: { patterns: string[]; morphologyNotes?: string[] };
  meaning: { uses: string[] };
  usageConstraints: string[];
  relationships: {
    prerequisites: string[];
    buildsOn: string[];
    contrastsWith: string[];
    oftenConfusedWith: string[];
  };
  rules: Array<{ code: string; type: string; description: string }>;
  examples: Array<{
    type: string;
    english: string;
    vietnamese: string;
    explanationVi: string;
  }>;
  commonErrors: Array<{
    code: string;
    incorrect: string;
    corrected: string;
    explanationVi: string;
    severity: string;
  }>;
  generationPolicy: Record<string, unknown>;
  evaluationPolicy: Record<string, unknown>;
  provenance: {
    origin: 'AI_GENERATED';
    model: string;
    promptVersion: string;
    generatedAt: string;
    sourceNotes?: string[];
  };
}

export type GrammarBundleValidation =
  { valid: true; value: GrammarBundle } | { valid: false; errors: string[] };
