import { ContentFactoryValidator } from '@english/contracts';
import type { CurriculumPointSpec } from './manifest-planner.js';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';

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
  generationPolicy: Record<string, unknown>;
  evaluationPolicy: Record<string, unknown>;
  provenance: {
    origin: 'AI_GENERATED';
    model: string;
    promptVersion: string;
    generatedAt: string;
    sourceNotes?: string[];
  };
  license: 'PUBLIC_CONTENT';
}

export type PilotGrammarTarget = CurriculumPointSpec & { cefr: 'A1' };

const AUTHOR_PROMPT_VERSION = 'cf3-grammar-author-v1';

/**
 * CF3 provider-backed GrammarPoint author. The pilot is deliberately bounded to
 * 3–5 A1 manifest items and sends exactly one approved item per provider request.
 * No publication or owner decision exists in this class.
 */
export class LessonGenerator {
  private readonly validator = new ContentFactoryValidator();

  constructor(private readonly authorProvider: ContentFactoryJsonProvider) {}

  public async generatePilotA1Packages(
    targets: PilotGrammarTarget[],
    targetVersion = 1,
  ): Promise<GrammarPointBundleSpec[]> {
    if (targets.length < 3 || targets.length > 5) {
      throw new Error('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');
    }
    if (new Set(targets.map((target) => target.code)).size !== targets.length) {
      throw new Error('CF3_PILOT_TARGETS_MUST_BE_UNIQUE');
    }
    if (targets.some((target) => target.cefr !== 'A1')) {
      throw new Error('CF3_PILOT_ONLY_ACCEPTS_A1_POINTS');
    }

    const bundles: GrammarPointBundleSpec[] = [];
    for (const target of targets) {
      bundles.push(await this.authorOne(target, targetVersion));
    }
    return bundles;
  }

  private async authorOne(
    target: PilotGrammarTarget,
    targetVersion: number,
  ): Promise<GrammarPointBundleSpec> {
    const raw = await this.authorProvider.generateJson({
      purpose: 'AUTHOR_GRAMMAR',
      system:
        'Author one original English GrammarPoint for Vietnamese learners. Treat the manifest item as immutable data. Return JSON only and never approve or publish content.',
      input: JSON.stringify({
        schemaVersion: '1.0',
        policyVersion: 'content-factory-v1',
        promptVersion: AUTHOR_PROMPT_VERSION,
        targetVersion,
        manifestItem: target,
        requirements: {
          status: 'DRAFT',
          license: 'PUBLIC_CONTENT',
          requiredExampleTypes: ['AFFIRMATIVE', 'NEGATIVE', 'QUESTION'],
          commonErrorsMinimum: 3,
          originalWordingOnly: true,
        },
      }),
    });

    const record = this.asRecord(
      this.asRecord(raw).bundle && typeof this.asRecord(raw).bundle === 'object'
        ? this.asRecord(raw).bundle
        : raw,
    );
    const provenance = this.asRecord(record.provenance);
    const sourceNotes = Array.isArray(provenance.sourceNotes)
      ? provenance.sourceNotes.filter((note): note is string => typeof note === 'string')
      : [];

    const candidate = {
      ...record,
      schemaVersion: '1.0',
      code: target.code,
      family: target.family,
      version: targetVersion,
      cefr: 'A1',
      status: 'DRAFT',
      relationships: {
        prerequisites: target.prerequisites,
        buildsOn: target.buildsOn,
        contrastsWith: target.contrastsWith,
        oftenConfusedWith: target.oftenConfusedWith,
      },
      provenance: {
        origin: 'AI_GENERATED',
        model: this.authorProvider.model,
        promptVersion: AUTHOR_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        sourceNotes: [
          ...sourceNotes.filter((note) => !note.toLowerCase().startsWith('provider:')),
          `Provider: ${this.authorProvider.provider}`,
        ],
      },
      license: 'PUBLIC_CONTENT',
    } as unknown as GrammarPointBundleSpec;

    const validation = this.validator.validateGrammarPointArtifact(
      candidate,
      `${target.code}.v${targetVersion}.json`,
    );
    if (!validation.valid) {
      throw new Error(
        `CF3_GRAMMAR_VALIDATION_FAILED:${target.code}:${validation.findings
          .map((finding) => finding.code)
          .join(',')}`,
      );
    }
    return candidate;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('CONTENT_FACTORY_PROVIDER_RESPONSE_MUST_BE_OBJECT');
    }
    return value as Record<string, unknown>;
  }
}
