/**
 * GrammarPoint bundle specification — models the contract output schema
 * defined by grammar-point.schema.json and 02-authoring-contract.md.
 *
 * Generation methods are NOT IMPLEMENTED until a real AI provider
 * is integrated per the CF3 pipeline:
 *   approved manifest item → provider-backed author → deterministic validation
 *   → independent review → fixture validation → owner approval
 */

export interface GrammarPointBundleSpec {
  schemaVersion: '1.0';
  code: string;
  family: string;
  version: number;
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
  title: string;
  learningObjectiveVi: string;
  learningObjectiveEn: string;
  form: {
    patterns: string[];
    morphologyNotes?: string[];
  };
  meaning: {
    uses: string[];
  };
  usageConstraints: string[];
  relationships: {
    prerequisites: string[];
    buildsOn: string[];
    contrastsWith: string[];
    oftenConfusedWith: string[];
  };
  rules: Array<{
    code: string;
    type: 'HARD_CONSTRAINT' | 'TENDENCY' | 'FORM' | 'MEANING' | 'USE';
    description: string;
  }>;
  examples: Array<{
    type: 'AFFIRMATIVE' | 'NEGATIVE' | 'QUESTION' | 'CONTEXTUAL' | 'CONTRASTIVE';
    english: string;
    vietnamese: string;
    explanationVi: string;
  }>;
  commonErrors: Array<{
    code: string;
    incorrect: string;
    corrected: string;
    explanationVi: string;
    severity: 'MINOR' | 'MAJOR' | 'BLOCKING';
  }>;
  generationPolicy?: Record<string, unknown>;
  evaluationPolicy?: Record<string, unknown>;
  provenance: {
    origin: 'AI_GENERATED';
    model: string;
    promptVersion: string;
    generatedAt: string;
    sourceNotes?: string[];
  };
  license: 'PUBLIC_CONTENT';
}

export interface BulkGenerationResult {
  totalGeneratedCount: number;
  packages: GrammarPointBundleSpec[];
  byCefr: Record<string, number>;
  allValid: boolean;
}

/**
 * Lesson generation requires a provider-backed AI authoring pipeline.
 * This class is a stub until CF3 is properly implemented with:
 * - An approved manifest item as input
 * - A real AI provider call (Tier 1 PUBLIC_CONTENT)
 * - Honest provenance recording (actual provider/model/prompt used)
 * - 3–5 A1 points for pilot, not the full set
 *
 * See contracts/content-factory/02-authoring-contract.md
 */
export class LessonGenerator {
  /**
   * CF3 pilot: generate 3–5 A1 GrammarPoint bundles through the full pipeline.
   * NOT IMPLEMENTED — requires provider-backed AI authoring.
   */
  public generatePilotA1Packages(): GrammarPointBundleSpec[] {
    throw new Error(
      'NOT_IMPLEMENTED: generatePilotA1Packages requires provider-backed AI authoring (CF3). ' +
        'Template-based placeholder generation was removed because it violates provenance ' +
        'and audit requirements. See contracts/content-factory/02-authoring-contract.md',
    );
  }

  /**
   * CF4 bulk: generate all level batches through the full pipeline.
   * NOT IMPLEMENTED — requires provider-backed AI authoring.
   */
  public generateAll235Packages(): GrammarPointBundleSpec[] {
    throw new Error(
      'NOT_IMPLEMENTED: generateAll235Packages requires provider-backed AI authoring (CF4). ' +
        'Template-based placeholder generation was removed because it violates provenance ' +
        'and audit requirements. See contracts/content-factory/02-authoring-contract.md',
    );
  }
}
