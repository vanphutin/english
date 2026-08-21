import { randomUUID } from 'node:crypto';
import { ContentFactoryValidator } from '@english/contracts';
import type { GrammarPointBundleSpec } from './lesson-generator.js';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { computeSha256 } from './idempotency-lease-manager.js';

export const CF3_EXERCISE_AUTHOR_PROMPT_VERSION = 'cf3-exercise-author-v1';
export const CF4_EXERCISE_AUTHOR_PROMPT_VERSION = 'cf4-exercise-author-v1';

type ActivityType =
  | 'TRANSLATE_CONTEXT'
  | 'CORRECT_ERROR'
  | 'TRANSFORM_SENTENCE'
  | 'COMPLETE_SENTENCE'
  | 'ORDER_WORDS'
  | 'SELECT_IN_CONTEXT'
  | 'GUIDED_WRITING'
  | 'MINI_DIALOGUE';

export interface ExerciseItemSpec {
  contentKey: string;
  activityType: ActivityType;
  topicCode: string;
  contextVi: string;
  sourceTextVi: string;
  instructionVi: string;
  promptPayload: Record<string, unknown>;
  targetNecessity: string;
  semanticRequirements: string[];
  allowedAnswers: string[];
  forbiddenMeaningChanges: string[];
  hints: string[];
  variationGroup: string;
  semanticHash: string;
  difficulty: number;
  validationNotes: string[];
}

export interface ExerciseAuthoringBatchSpec {
  schemaVersion: '1.0';
  batchId: string;
  grammarPointCode: string;
  grammarPointVersion: number;
  grammarPointHash: string;
  policyVersion: 'content-factory-v1';
  seed: string;
  exercises: ExerciseItemSpec[];
  provenance: {
    origin: 'AI_DRAFT';
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
  };
}

export interface ExercisePreflightResult {
  targetNecessityPassed: boolean;
  ambiguityPassed: boolean;
  evaluatorPassed: boolean;
  findingCodes: string[];
}

export interface ExercisePreflightPort {
  evaluate(params: {
    grammarPoint: GrammarPointBundleSpec;
    exercise: ExerciseItemSpec;
  }): Promise<ExercisePreflightResult>;
}

export interface ExercisePreflightEvidence {
  contentKey: string;
  result: ExercisePreflightResult;
}

export interface ExerciseBatchPreflightPort {
  evaluateBatch(params: {
    grammarPoint: GrammarPointBundleSpec;
    exercises: ExerciseItemSpec[];
  }): Promise<ExercisePreflightEvidence[]>;
}

export interface ExerciseFactoryResult {
  batch: ExerciseAuthoringBatchSpec;
  preflightEvidence: ExercisePreflightEvidence[];
}

type ExercisePreflight = ExercisePreflightPort | ExerciseBatchPreflightPort;

/**
 * Exercise factory shared by CF3/CF4. Learner-facing source/presentation data is
 * pinned in the same immutable artifact as evaluator truth, but promptPayload
 * is validated to exclude evaluator-only answer fields.
 */
export class ExerciseFactory {
  private readonly validator = new ContentFactoryValidator();

  constructor(
    private readonly authorProvider: ContentFactoryJsonProvider,
    private readonly preflight: ExercisePreflight,
  ) {}

  public async generateMinimumBank(params: {
    grammarPoint: GrammarPointBundleSpec;
    count?: number;
    seed?: string;
    promptVersion?: string;
  }): Promise<ExerciseAuthoringBatchSpec> {
    return (await this.generateMinimumBankWithEvidence(params)).batch;
  }

  public async generateMinimumBankWithEvidence(params: {
    grammarPoint: GrammarPointBundleSpec;
    count?: number;
    seed?: string;
    promptVersion?: string;
  }): Promise<ExerciseFactoryResult> {
    const count = params.count ?? 12;
    if (count < 12 || count > 30) throw new Error('EXERCISE_COUNT_MUST_BE_12_TO_30');
    const promptVersion = params.promptVersion ?? CF3_EXERCISE_AUTHOR_PROMPT_VERSION;

    const grammarValidation = this.validator.validateGrammarPointArtifact(
      params.grammarPoint,
      `${params.grammarPoint.code}.v${params.grammarPoint.version}.json`,
    );
    if (!grammarValidation.valid) throw new Error('EXERCISE_REQUIRES_VALID_GRAMMAR_POINT');

    const grammarPointHash = computeSha256(JSON.stringify(params.grammarPoint));
    const seed = params.seed ?? grammarPointHash.slice(0, 16);
    const raw = await this.authorProvider.generateJson({
      purpose: 'AUTHOR_EXERCISES',
      system:
        'Author an original exercise bank for the supplied validated GrammarPoint. Return JSON only. Every exercise must include sourceTextVi and a presentation-only promptPayload appropriate to its activity type. Never place allowedAnswers, reference answers, correct answers, grading rubrics, evaluator notes, or hidden solution data inside promptPayload, sourceTextVi, contextVi, instructions, or hints. Do not publish content.',
      input: JSON.stringify({
        schemaVersion: '1.0',
        promptVersion,
        grammarPoint: params.grammarPoint,
        grammarPointHash,
        seed,
        presentationContract: {
          sourceTextVi: 'Exact learner-visible task/source text, distinct from the general instruction.',
          promptPayloadByActivity: {
            TRANSLATE_CONTEXT: {},
            CORRECT_ERROR: { incorrectSentence: 'string' },
            TRANSFORM_SENTENCE: {
              sourceSentence: 'string',
              transformationGoalVi: 'string',
            },
            COMPLETE_SENTENCE: { starter: 'string' },
            ORDER_WORDS: { wordBank: ['string'] },
            SELECT_IN_CONTEXT: { choices: ['string', 'string'] },
            GUIDED_WRITING: { requiredElements: ['string'] },
            MINI_DIALOGUE: {},
          },
          evaluatorOnlyKeysForbiddenFromPromptPayload: [
            'allowedAnswers',
            'referenceAnswers',
            'correctAnswer',
            'answerKey',
            'rubric',
            'evaluationPolicy',
          ],
        },
        requirements: {
          exactExerciseCount: count,
          minimumActivityTypes: 4,
          minimumTopicContexts: 6,
          maximumSingleActivityShare: 0.4,
          semanticDuplicatesAllowed: 0,
          validationNotesAreNonAuthoritative: true,
        },
      }),
    });

    const rawRecord = this.asRecord(raw);
    const record =
      rawRecord.batch && typeof rawRecord.batch === 'object'
        ? this.asRecord(rawRecord.batch)
        : rawRecord;
    const exercises = Array.isArray(record.exercises)
      ? (record.exercises as ExerciseItemSpec[])
      : [];
    const batch = {
      ...record,
      schemaVersion: '1.0',
      batchId: randomUUID(),
      grammarPointCode: params.grammarPoint.code,
      grammarPointVersion: params.grammarPoint.version,
      grammarPointHash,
      policyVersion: 'content-factory-v1',
      seed,
      exercises,
      provenance: {
        origin: 'AI_DRAFT',
        provider: this.authorProvider.provider,
        model: this.authorProvider.model,
        promptVersion,
        generatedAt: new Date().toISOString(),
      },
    } as unknown as ExerciseAuthoringBatchSpec;

    const deterministic = this.validator.validateExerciseBatchArtifact(
      batch,
      `${params.grammarPoint.code}.exercise-batch.json`,
    );
    if (!deterministic.valid) {
      throw new Error(
        `EXERCISE_DETERMINISTIC_VALIDATION_FAILED:${deterministic.findings
          .map((finding) => finding.code)
          .join(',')}`,
      );
    }

    this.assertReadiness(batch, count);
    const preflightEvidence = await this.assertIndependentPreflight(
      params.grammarPoint,
      batch.exercises,
    );
    return { batch, preflightEvidence };
  }

  private assertReadiness(batch: ExerciseAuthoringBatchSpec, expectedCount: number): void {
    if (batch.exercises.length !== expectedCount || batch.exercises.length < 12) {
      throw new Error('EXERCISE_READINESS_MINIMUM_NOT_MET');
    }

    const semanticHashes = new Set<string>();
    const exactPrompts = new Set<string>();
    const activityCounts = new Map<ActivityType, number>();
    const topics = new Set<string>();

    for (const exercise of batch.exercises) {
      if (semanticHashes.has(exercise.semanticHash)) {
        throw new Error('EXERCISE_SEMANTIC_DUPLICATE');
      }
      semanticHashes.add(exercise.semanticHash);

      const exactKey = `${exercise.contextVi.trim().toLowerCase()}|${exercise.sourceTextVi
        .trim()
        .toLowerCase()}|${exercise.instructionVi.trim().toLowerCase()}`;
      if (exactPrompts.has(exactKey)) throw new Error('EXERCISE_EXACT_DUPLICATE');
      exactPrompts.add(exactKey);

      activityCounts.set(
        exercise.activityType,
        (activityCounts.get(exercise.activityType) ?? 0) + 1,
      );
      topics.add(exercise.topicCode);
      if (exercise.targetNecessity.trim().length < 10) {
        throw new Error('EXERCISE_TARGET_NECESSITY_UNPROVEN');
      }
      if (exercise.sourceTextVi.trim().length < 2) {
        throw new Error(`EXERCISE_SOURCE_TEXT_REQUIRED:${exercise.contentKey}`);
      }
      this.assertPresentationPayload(exercise);
    }

    if (activityCounts.size < 4) throw new Error('EXERCISE_ACTIVITY_DIVERSITY_INSUFFICIENT');
    if (topics.size < 6) throw new Error('EXERCISE_TOPIC_DIVERSITY_INSUFFICIENT');

    const maximumActivityCount = Math.max(...activityCounts.values());
    if (maximumActivityCount / batch.exercises.length > 0.4) {
      throw new Error('EXERCISE_ACTIVITY_CONCENTRATION_EXCEEDED');
    }
  }

  private assertPresentationPayload(exercise: ExerciseItemSpec): void {
    const payload = exercise.promptPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`EXERCISE_PROMPT_PAYLOAD_INVALID:${exercise.contentKey}`);
    }
    this.assertNoEvaluatorKeys(payload, exercise.contentKey);

    switch (exercise.activityType) {
      case 'CORRECT_ERROR':
        this.requirePayloadString(payload, 'incorrectSentence', exercise.contentKey);
        break;
      case 'TRANSFORM_SENTENCE':
        this.requirePayloadString(payload, 'sourceSentence', exercise.contentKey);
        this.requirePayloadString(payload, 'transformationGoalVi', exercise.contentKey);
        break;
      case 'COMPLETE_SENTENCE':
        this.requirePayloadString(payload, 'starter', exercise.contentKey);
        break;
      case 'ORDER_WORDS':
        this.requirePayloadStringArray(payload, 'wordBank', exercise.contentKey, 2);
        break;
      case 'SELECT_IN_CONTEXT':
        this.requirePayloadStringArray(payload, 'choices', exercise.contentKey, 2);
        break;
      case 'GUIDED_WRITING':
        this.requirePayloadStringArray(payload, 'requiredElements', exercise.contentKey, 1);
        break;
      case 'TRANSLATE_CONTEXT':
      case 'MINI_DIALOGUE':
        break;
    }
  }

  private assertNoEvaluatorKeys(value: unknown, contentKey: string): void {
    const forbidden = new Set([
      'allowedanswers',
      'referenceanswers',
      'correctanswer',
      'answerkey',
      'rubric',
      'evaluationpolicy',
      'validationnotes',
    ]);
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
        if (forbidden.has(key.toLowerCase())) {
          throw new Error(`EXERCISE_PROMPT_PAYLOAD_LEAKS_EVALUATOR_DATA:${contentKey}:${key}`);
        }
        visit(nested);
      }
    };
    visit(value);
  }

  private requirePayloadString(
    payload: Record<string, unknown>,
    key: string,
    contentKey: string,
  ): void {
    const value = payload[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`EXERCISE_PROMPT_PAYLOAD_FIELD_REQUIRED:${contentKey}:${key}`);
    }
  }

  private requirePayloadStringArray(
    payload: Record<string, unknown>,
    key: string,
    contentKey: string,
    minimum: number,
  ): void {
    const value = payload[key];
    if (
      !Array.isArray(value) ||
      value.length < minimum ||
      value.some((item) => typeof item !== 'string' || item.trim().length === 0)
    ) {
      throw new Error(`EXERCISE_PROMPT_PAYLOAD_FIELD_REQUIRED:${contentKey}:${key}`);
    }
  }

  /** AI-authored validationNotes are never accepted as proof of these gates. */
  private async assertIndependentPreflight(
    grammarPoint: GrammarPointBundleSpec,
    exercises: ExerciseItemSpec[],
  ): Promise<ExercisePreflightEvidence[]> {
    const evidence = this.isBatchPreflight(this.preflight)
      ? await this.preflight.evaluateBatch({ grammarPoint, exercises })
      : await this.evaluateIndividually(this.preflight, grammarPoint, exercises);

    this.assertEvidenceCoverage(exercises, evidence);
    for (const item of evidence) this.assertPreflightResult(item);
    return evidence;
  }

  private async evaluateIndividually(
    preflight: ExercisePreflightPort,
    grammarPoint: GrammarPointBundleSpec,
    exercises: ExerciseItemSpec[],
  ): Promise<ExercisePreflightEvidence[]> {
    const evidence: ExercisePreflightEvidence[] = [];
    for (const exercise of exercises) {
      evidence.push({
        contentKey: exercise.contentKey,
        result: await preflight.evaluate({ grammarPoint, exercise }),
      });
    }
    return evidence;
  }

  private assertEvidenceCoverage(
    exercises: ExerciseItemSpec[],
    evidence: ExercisePreflightEvidence[],
  ): void {
    if (evidence.length !== exercises.length) {
      throw new Error('EXERCISE_PREFLIGHT_EVIDENCE_COUNT_MISMATCH');
    }
    const expected = new Set(exercises.map((exercise) => exercise.contentKey));
    const observed = new Set<string>();
    for (const item of evidence) {
      if (!expected.has(item.contentKey)) {
        throw new Error(`EXERCISE_PREFLIGHT_UNKNOWN_CONTENT_KEY:${item.contentKey}`);
      }
      if (observed.has(item.contentKey)) {
        throw new Error(`EXERCISE_PREFLIGHT_DUPLICATE_CONTENT_KEY:${item.contentKey}`);
      }
      observed.add(item.contentKey);
    }
    if (observed.size !== expected.size) {
      throw new Error('EXERCISE_PREFLIGHT_EVIDENCE_INCOMPLETE');
    }
  }

  private assertPreflightResult(item: ExercisePreflightEvidence): void {
    if (!item.result.targetNecessityPassed) {
      throw new Error(
        `EXERCISE_PREFLIGHT_FAILED:TARGET:${item.contentKey}:${item.result.findingCodes.join(',')}`,
      );
    }
    if (!item.result.ambiguityPassed) {
      throw new Error(
        `EXERCISE_PREFLIGHT_FAILED:AMBIGUITY:${item.contentKey}:${item.result.findingCodes.join(',')}`,
      );
    }
    if (!item.result.evaluatorPassed) {
      throw new Error(
        `EXERCISE_PREFLIGHT_FAILED:EVALUATOR:${item.contentKey}:${item.result.findingCodes.join(',')}`,
      );
    }
  }

  private isBatchPreflight(preflight: ExercisePreflight): preflight is ExerciseBatchPreflightPort {
    return 'evaluateBatch' in preflight && typeof preflight.evaluateBatch === 'function';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('EXERCISE_PROVIDER_RESPONSE_MUST_BE_OBJECT');
    }
    return value as Record<string, unknown>;
  }
}
