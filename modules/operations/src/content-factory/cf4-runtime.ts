import type { PrismaClient } from '@prisma/client';
import { OpenAiCompatibleClient } from '../openai-compatible-client.js';
import { probeOpenAiCompatibleProvider } from '../capability-probe.js';
import type { AiProviderName, ProviderConfiguration } from '../types.js';
import { OpenAiCompatibleJsonProvider, type ContentFactoryJsonProvider } from './ai-content-provider.js';
import { AiExerciseBatchPreflight } from './ai-exercise-batch-preflight.js';
import { BudgetedContentFactoryJsonProvider } from './budgeted-content-provider.js';
import { Cf4ApprovedBatchRepository } from './cf4-approved-batch-repository.js';
import { Cf4ExecutionControl } from './cf4-execution-control.js';
import { Cf4LevelBatchService } from './cf4-level-batch.service.js';
import { PrismaCf4ManifestApprovalGate } from './cf4-manifest-approval-gate.js';
import { Cf4RetryBudgetService, type Cf4RetryBudgetPolicy } from './cf4-retry-budget.service.js';
import { ContentFactoryOrchestratorService } from './content-factory-orchestrator.service.js';
import { ExerciseFactory } from './exercise-factory.js';
import { IndependentContentReviewer } from './independent-reviewer.js';
import { LessonGenerator } from './lesson-generator.js';
import { ContentReviewRunRepository } from './review-run-repository.js';
import { ContentFactoryStorageRepository } from './storage-repository.js';
import { ContentValidationRunRepository } from './validation-run-repository.js';

export type Cf4AuthorProviderChoice = 'OPENAI' | 'SECONDARY';

export interface Cf4RuntimeProviderSummary {
  author: { provider: AiProviderName; model: string };
  reviewer: { provider: AiProviderName; model: string };
  preflight: { provider: AiProviderName; model: string };
  secondaryProbeStatus: 'NOT_USED' | 'VERIFIED';
}

export interface Cf4Runtime {
  batchRepository: Cf4ApprovedBatchRepository;
  retryService: Cf4RetryBudgetService;
  budgetPolicy: Partial<Cf4RetryBudgetPolicy>;
  providers: Cf4RuntimeProviderSummary;
}

type Env = Record<string, string | undefined>;

/**
 * Production composition root for one batch-scoped CF4 run. No keys are logged
 * or persisted. Secondary authoring is opt-in and requires both explicit golden
 * approval and a live capability probe before any learner-content generation.
 */
export async function createCf4Runtime(params: {
  prisma: PrismaClient;
  runId: string;
  env?: Env;
  storageDir?: string;
}): Promise<Cf4Runtime> {
  const env = params.env ?? process.env;
  const storage = new ContentFactoryStorageRepository(params.storageDir);
  const orchestrator = new ContentFactoryOrchestratorService(params.prisma, params.storageDir);
  const manifestGate = new PrismaCf4ManifestApprovalGate(params.prisma, storage);
  const execution = new Cf4ExecutionControl(params.prisma, storage);

  const openAiKey = requireValue(env.OPENAI_API_KEY, 'OPENAI_API_KEY_REQUIRED');
  const authorChoice = parseAuthorChoice(env.CONTENT_FACTORY_AUTHOR_PROVIDER);
  const openAiAuthorModel = env.OPENAI_AUTHORING_MODEL?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-5-mini';
  const openAiReviewModel = requireValue(
    env.OPENAI_REVIEW_MODEL?.trim() || env.OPENAI_MODEL?.trim(),
    'OPENAI_REVIEW_MODEL_REQUIRED',
  );
  const openAiPreflightModel = env.OPENAI_PREFLIGHT_MODEL?.trim() || openAiReviewModel;
  const openAiConfig = providerConfig({
    name: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: openAiKey,
    allowedHosts: ['api.openai.com'],
    timeoutMs: positiveInteger(env.OPENAI_TIMEOUT_MS, 30000),
    maxTransientRetries: nonNegativeInteger(env.OPENAI_MAX_TRANSIENT_RETRIES, 2),
  });

  const reviewerProvider = new OpenAiCompatibleJsonProvider(
    new OpenAiCompatibleClient(openAiConfig),
    'OPENAI',
    openAiReviewModel,
    'RESPONSES',
  );
  const rawPreflightProvider = new OpenAiCompatibleJsonProvider(
    new OpenAiCompatibleClient(openAiConfig),
    'OPENAI',
    openAiPreflightModel,
    'RESPONSES',
  );

  let authorProvider: ContentFactoryJsonProvider;
  let secondaryProbeStatus: Cf4RuntimeProviderSummary['secondaryProbeStatus'] = 'NOT_USED';
  if (authorChoice === 'SECONDARY') {
    if (!isTrue(env.SECONDARY_AI_ENABLED)) throw new Error('SECONDARY_AI_NOT_ENABLED');
    if (!isTrue(env.CONTENT_FACTORY_SECONDARY_GOLDEN_APPROVED)) {
      throw new Error('SECONDARY_AI_GOLDEN_APPROVAL_REQUIRED');
    }
    const secondaryModel = requireValue(env.SECONDARY_AI_MODEL, 'SECONDARY_AI_MODEL_REQUIRED');
    const secondaryConfig = providerConfig({
      name: 'SECONDARY_OPENAI_COMPATIBLE',
      baseUrl: requireValue(env.SECONDARY_AI_BASE_URL, 'SECONDARY_AI_BASE_URL_REQUIRED'),
      apiKey: requireValue(env.SECONDARY_AI_API_KEY, 'SECONDARY_AI_API_KEY_REQUIRED'),
      allowedHosts: [
        requireValue(env.SECONDARY_AI_ALLOWED_HOST, 'SECONDARY_AI_ALLOWED_HOST_REQUIRED'),
      ],
      timeoutMs: positiveInteger(env.SECONDARY_AI_TIMEOUT_MS, 30000),
      maxTransientRetries: nonNegativeInteger(env.SECONDARY_AI_MAX_TRANSIENT_RETRIES, 2),
    });
    const secondaryClient = new OpenAiCompatibleClient(secondaryConfig);
    const report = await probeOpenAiCompatibleProvider(secondaryClient, {
      provider: 'SECONDARY_OPENAI_COMPATIBLE',
      requestedModel: secondaryModel,
    });
    if (report.status !== 'VERIFIED' || report.selectedModel !== secondaryModel) {
      throw new Error(`SECONDARY_AI_CAPABILITY_NOT_VERIFIED:${report.status}`);
    }
    authorProvider = new OpenAiCompatibleJsonProvider(
      secondaryClient,
      'SECONDARY_OPENAI_COMPATIBLE',
      secondaryModel,
      'CHAT_COMPLETIONS',
    );
    secondaryProbeStatus = 'VERIFIED';
  } else {
    authorProvider = new OpenAiCompatibleJsonProvider(
      new OpenAiCompatibleClient(openAiConfig),
      'OPENAI',
      openAiAuthorModel,
      'RESPONSES',
    );
  }

  assertIndependent(
    { provider: authorProvider.provider, model: authorProvider.model },
    { provider: reviewerProvider.provider, model: reviewerProvider.model },
    'CONTENT_FACTORY_REVIEWER_INDEPENDENCE_CONFIG_REQUIRED',
  );
  assertIndependent(
    { provider: authorProvider.provider, model: authorProvider.model },
    { provider: rawPreflightProvider.provider, model: rawPreflightProvider.model },
    'CONTENT_FACTORY_PREFLIGHT_INDEPENDENCE_CONFIG_REQUIRED',
  );

  const budgetedPreflightProvider = new BudgetedContentFactoryJsonProvider(
    rawPreflightProvider,
    execution,
    params.runId,
    {
      outputTokens: positiveInteger(env.CONTENT_FACTORY_PREFLIGHT_OUTPUT_TOKENS, 5000),
      estimatedCost: nonNegativeNumber(env.CONTENT_FACTORY_PREFLIGHT_ESTIMATED_COST, 0),
    },
  );
  const preflight = new AiExerciseBatchPreflight(budgetedPreflightProvider, {
    provider: authorProvider.provider,
    model: authorProvider.model,
  });
  const grammarAuthor = new LessonGenerator(authorProvider);
  const reviewer = new IndependentContentReviewer(reviewerProvider);
  const exerciseFactory = new ExerciseFactory(authorProvider, preflight);
  const validationRuns = new ContentValidationRunRepository(params.prisma);
  const reviewRuns = new ContentReviewRunRepository(params.prisma);
  const baseline = new Cf4LevelBatchService(
    params.prisma,
    orchestrator,
    manifestGate,
    grammarAuthor,
    reviewer,
    exerciseFactory,
    validationRuns,
    reviewRuns,
    storage,
  );
  const retryService = new Cf4RetryBudgetService(
    params.prisma,
    baseline,
    orchestrator,
    manifestGate,
    grammarAuthor,
    reviewer,
    exerciseFactory,
    validationRuns,
    reviewRuns,
    storage,
  );

  return {
    batchRepository: new Cf4ApprovedBatchRepository(params.prisma, storage),
    retryService,
    budgetPolicy: {
      grammar: {
        outputTokens: positiveInteger(env.CONTENT_FACTORY_GRAMMAR_OUTPUT_TOKENS, 3500),
        estimatedCost: nonNegativeNumber(env.CONTENT_FACTORY_GRAMMAR_ESTIMATED_COST, 0),
      },
      review: {
        outputTokens: positiveInteger(env.CONTENT_FACTORY_REVIEW_OUTPUT_TOKENS, 2200),
        estimatedCost: nonNegativeNumber(env.CONTENT_FACTORY_REVIEW_ESTIMATED_COST, 0),
      },
      exerciseOutputTokensPerItem: positiveInteger(
        env.CONTENT_FACTORY_EXERCISE_OUTPUT_TOKENS_PER_ITEM,
        350,
      ),
      exerciseEstimatedCost: nonNegativeNumber(
        env.CONTENT_FACTORY_EXERCISE_ESTIMATED_COST,
        0,
      ),
      conservativeInputTokensPerReviewedGrammar: positiveInteger(
        env.CONTENT_FACTORY_REVIEW_INPUT_TOKEN_RESERVE,
        4500,
      ),
      conservativeInputTokensPerExerciseBank: positiveInteger(
        env.CONTENT_FACTORY_EXERCISE_INPUT_TOKEN_RESERVE,
        5000,
      ),
    },
    providers: {
      author: { provider: authorProvider.provider, model: authorProvider.model },
      reviewer: { provider: reviewerProvider.provider, model: reviewerProvider.model },
      preflight: { provider: rawPreflightProvider.provider, model: rawPreflightProvider.model },
      secondaryProbeStatus,
    },
  };
}

function providerConfig(config: ProviderConfiguration): ProviderConfiguration {
  return config;
}

function parseAuthorChoice(value: string | undefined): Cf4AuthorProviderChoice {
  const normalized = value?.trim().toUpperCase() || 'OPENAI';
  if (normalized === 'OPENAI' || normalized === 'SECONDARY') return normalized;
  throw new Error('CONTENT_FACTORY_AUTHOR_PROVIDER_INVALID');
}

function assertIndependent(
  author: { provider: string; model: string },
  reviewer: { provider: string; model: string },
  errorCode: string,
): void {
  if (author.provider === reviewer.provider && author.model === reviewer.model) {
    throw new Error(errorCode);
  }
}

function requireValue(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('CF4_RUNTIME_INTEGER_CONFIG_INVALID');
  return parsed;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('CF4_RUNTIME_INTEGER_CONFIG_INVALID');
  return parsed;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('CF4_RUNTIME_NUMBER_CONFIG_INVALID');
  return parsed;
}
