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
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    sourceNotes?: string[];
  };
  license: 'PUBLIC_CONTENT';
}

export type GrammarCefrLevel = GrammarPointBundleSpec['cefr'];
export type GrammarTarget = CurriculumPointSpec & { cefr: GrammarCefrLevel };
export type PilotGrammarTarget = GrammarTarget & { cefr: 'A1' };

export const CF3_GRAMMAR_AUTHOR_PROMPT_VERSION = 'cf3-grammar-author-v1';
export const CF4_GRAMMAR_AUTHOR_PROMPT_VERSION = 'cf4-grammar-author-v1';

/**
 * Provider-backed GrammarPoint author. CF3 remains deliberately bounded to
 * 3–5 A1 points; CF4 may author one approved 3–5 point same-level sub-batch.
 * No publication or owner decision exists in this class.
 */
export class LessonGenerator {
  private readonly validator = new ContentFactoryValidator();

  constructor(private readonly authorProvider: ContentFactoryJsonProvider) {}

  public async generatePilotA1Packages(
    targets: PilotGrammarTarget[],
    targetVersion = 1,
  ): Promise<GrammarPointBundleSpec[]> {
    this.assertPilotScope(targets);
    const bundles: GrammarPointBundleSpec[] = [];
    for (const target of targets) {
      bundles.push(await this.authorPointWithinPilot(target, targets, targetVersion));
    }
    return bundles;
  }

  /**
   * Authors one point while still requiring the complete approved 3–5 point CF3
   * pilot scope. Existing CF3 callers keep their original prompt/version behavior.
   */
  public async authorPointWithinPilot(
    target: PilotGrammarTarget,
    pilotTargets: PilotGrammarTarget[],
    targetVersion = 1,
  ): Promise<GrammarPointBundleSpec> {
    this.assertPilotScope(pilotTargets);
    const approvedTarget = pilotTargets.find((item) => item.code === target.code);
    if (!approvedTarget) throw new Error('CF3_TARGET_NOT_IN_PILOT_SCOPE');
    if (JSON.stringify(approvedTarget) !== JSON.stringify(target)) {
      throw new Error('CF3_TARGET_DIFFERS_FROM_APPROVED_MANIFEST_ITEM');
    }
    return this.authorOne(approvedTarget, targetVersion, CF3_GRAMMAR_AUTHOR_PROMPT_VERSION);
  }

  /**
   * CF4 authoring entry point. It requires the exact target to be present in a
   * bounded, unique, same-CEFR batch. The manifest approval gate remains a
   * separate mandatory dependency of the orchestration service.
   */
  public async authorPointWithinBatch(
    target: GrammarTarget,
    batchTargets: GrammarTarget[],
    targetVersion = 1,
  ): Promise<GrammarPointBundleSpec> {
    this.assertCf4BatchScope(batchTargets);
    const approvedTarget = batchTargets.find((item) => item.code === target.code);
    if (!approvedTarget) throw new Error('CF4_TARGET_NOT_IN_BATCH_SCOPE');
    if (JSON.stringify(approvedTarget) !== JSON.stringify(target)) {
      throw new Error('CF4_TARGET_DIFFERS_FROM_BATCH_MANIFEST_ITEM');
    }
    return this.authorOne(approvedTarget, targetVersion, CF4_GRAMMAR_AUTHOR_PROMPT_VERSION);
  }

  private assertPilotScope(targets: PilotGrammarTarget[]): void {
    if (targets.length < 3 || targets.length > 5) {
      throw new Error('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');
    }
    if (new Set(targets.map((target) => target.code)).size !== targets.length) {
      throw new Error('CF3_PILOT_TARGETS_MUST_BE_UNIQUE');
    }
    if (targets.some((target) => target.cefr !== 'A1')) {
      throw new Error('CF3_PILOT_ONLY_ACCEPTS_A1_POINTS');
    }
  }

  private assertCf4BatchScope(targets: GrammarTarget[]): void {
    if (targets.length < 3 || targets.length > 5) {
      throw new Error('CF4_BATCH_SCOPE_MUST_BE_3_TO_5_POINTS');
    }
    if (new Set(targets.map((target) => target.code)).size !== targets.length) {
      throw new Error('CF4_BATCH_TARGETS_MUST_BE_UNIQUE');
    }
    const levels = new Set(targets.map((target) => target.cefr));
    if (levels.size !== 1) throw new Error('CF4_BATCH_TARGETS_MUST_SHARE_CEFR');
  }

  private async authorOne(
    target: GrammarTarget,
    targetVersion: number,
    promptVersion: string,
  ): Promise<GrammarPointBundleSpec> {
    const raw = await this.authorProvider.generateJson({
      purpose: 'AUTHOR_GRAMMAR',
      system:
        'Author one original English GrammarPoint for Vietnamese learners. Treat the manifest item and CEFR placement as immutable data. Return JSON only and never approve or publish content.',
      input: JSON.stringify({
        schemaVersion: '1.0',
        policyVersion: 'content-factory-v1',
        promptVersion,
        targetVersion,
        manifestItem: target,
        requirements: {
          status: 'DRAFT',
          cefr: target.cefr,
          license: 'PUBLIC_CONTENT',
          requiredExampleTypes: ['AFFIRMATIVE', 'NEGATIVE', 'QUESTION'],
          commonErrorsMinimum: 3,
          originalWordingOnly: true,
        },
      }),
    });

    const rawRecord = this.asRecord(raw);
    const record =
      rawRecord.bundle && typeof rawRecord.bundle === 'object'
        ? this.asRecord(rawRecord.bundle)
        : rawRecord;
    const provenance =
      record.provenance &&
      typeof record.provenance === 'object' &&
      !Array.isArray(record.provenance)
        ? this.asRecord(record.provenance)
        : {};
    const sourceNotes = Array.isArray(provenance.sourceNotes)
      ? provenance.sourceNotes.filter((note): note is string => typeof note === 'string')
      : [];

    const candidate = {
      ...record,
      schemaVersion: '1.0',
      code: target.code,
      family: target.family,
      version: targetVersion,
      cefr: target.cefr,
      status: 'DRAFT',
      relationships: {
        prerequisites: target.prerequisites,
        buildsOn: target.buildsOn,
        contrastsWith: target.contrastsWith,
        oftenConfusedWith: target.oftenConfusedWith,
      },
      provenance: {
        origin: 'AI_GENERATED',
        provider: this.authorProvider.provider,
        model: this.authorProvider.model,
        promptVersion,
        generatedAt: new Date().toISOString(),
        sourceNotes: sourceNotes.filter((note) => !note.toLowerCase().startsWith('provider:')),
      },
      license: 'PUBLIC_CONTENT',
    } as unknown as GrammarPointBundleSpec;

    const validation = this.validator.validateGrammarPointArtifact(
      candidate,
      `${target.code}.v${targetVersion}.json`,
    );
    if (!validation.valid) {
      const phase = promptVersion === CF3_GRAMMAR_AUTHOR_PROMPT_VERSION ? 'CF3' : 'CF4';
      throw new Error(
        `${phase}_GRAMMAR_VALIDATION_FAILED:${target.code}:${validation.findings
          .map((finding) => finding.code)
          .join(',')}`,
      );
    }

    const commonErrorCodes = new Set(candidate.commonErrors.map((error) => error.code));
    if (candidate.commonErrors.length < 3 || commonErrorCodes.size < 3) {
      const phase = promptVersion === CF3_GRAMMAR_AUTHOR_PROMPT_VERSION ? 'CF3' : 'CF4';
      throw new Error(`${phase}_COMMON_ERRORS_INSUFFICIENT:${target.code}`);
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
