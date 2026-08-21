import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { OpenAiCompatibleClient } from '../modules/operations/src/openai-compatible-client.js';
import { OpenAiCompatibleJsonProvider } from '../modules/operations/src/content-factory/ai-content-provider.js';
import { Cf3PilotService } from '../modules/operations/src/content-factory/cf3-pilot.service.js';
import { PrismaCf3ManifestApprovalGate } from '../modules/operations/src/content-factory/cf3-manifest-approval-gate.js';
import { ContentFactoryOrchestratorService } from '../modules/operations/src/content-factory/content-factory-orchestrator.service.js';
import { ExerciseFactory } from '../modules/operations/src/content-factory/exercise-factory.js';
import { IndependentContentReviewer } from '../modules/operations/src/content-factory/independent-reviewer.js';
import { LessonGenerator } from '../modules/operations/src/content-factory/lesson-generator.js';
import { ProviderExercisePreflight } from '../modules/operations/src/content-factory/provider-exercise-preflight.js';
import { ContentReviewRunRepository } from '../modules/operations/src/content-factory/review-run-repository.js';
import { ContentFactoryStorageRepository } from '../modules/operations/src/content-factory/storage-repository.js';
import { ContentValidationRunRepository } from '../modules/operations/src/content-factory/validation-run-repository.js';

const prisma = new PrismaClient();

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_REQUIRED_ENV:${name}`);
  return value;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const isEnabled = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

const asRecord = (value: unknown, errorCode: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorCode);
  return value as Record<string, unknown>;
};

function assertVerifiedSecondaryCapability(model: string): void {
  const reportPath = resolve(
    process.env.SECONDARY_AI_CAPABILITY_REPORT ?? 'reports/ai-provider-capability-report.json',
  );
  let report: Record<string, unknown>;
  try {
    report = asRecord(
      JSON.parse(readFileSync(reportPath, 'utf8')) as unknown,
      'SECONDARY_CAPABILITY_REPORT_INVALID',
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SECONDARY_CAPABILITY_REPORT_INVALID') {
      throw error;
    }
    throw new Error(`SECONDARY_CAPABILITY_REPORT_MISSING_OR_INVALID:${reportPath}`);
  }

  if (report.status !== 'VERIFIED' || report.provider !== 'SECONDARY_OPENAI_COMPATIBLE') {
    throw new Error('SECONDARY_PROVIDER_NOT_VERIFIED');
  }
  if (report.selectedModel !== model) throw new Error('SECONDARY_VERIFIED_MODEL_MISMATCH');

  const checks = Array.isArray(report.checks) ? report.checks : [];
  const byCapability = new Map<string, unknown>();
  for (const check of checks) {
    if (!check || typeof check !== 'object' || Array.isArray(check)) continue;
    const record = check as Record<string, unknown>;
    if (typeof record.capability === 'string') byCapability.set(record.capability, record.status);
  }
  for (const capability of [
    'AUTH_MODELS',
    'CHAT_COMPLETIONS',
    'VIETNAMESE_UNICODE',
    'STRUCTURED_OUTPUT',
    'PROMPT_INJECTION_BOUNDARY',
  ]) {
    if (byCapability.get(capability) !== 'PASS') {
      throw new Error(`SECONDARY_REQUIRED_CAPABILITY_NOT_VERIFIED:${capability}`);
    }
  }
}

function createAuthorProvider(): OpenAiCompatibleJsonProvider {
  if (isEnabled(process.env.SECONDARY_AI_ENABLED)) {
    const baseUrl = requiredEnv('SECONDARY_AI_BASE_URL');
    const allowedHost = requiredEnv('SECONDARY_AI_ALLOWED_HOST');
    const model = requiredEnv('SECONDARY_AI_MODEL');
    assertVerifiedSecondaryCapability(model);
    const client = new OpenAiCompatibleClient({
      name: 'SECONDARY_OPENAI_COMPATIBLE',
      baseUrl,
      apiKey: requiredEnv('SECONDARY_AI_API_KEY'),
      allowedHosts: [allowedHost],
      timeoutMs: positiveInteger(process.env.SECONDARY_AI_TIMEOUT_MS, 30_000),
      maxTransientRetries: Math.min(
        2,
        positiveInteger(process.env.SECONDARY_AI_MAX_TRANSIENT_RETRIES, 2),
      ),
    });
    return new OpenAiCompatibleJsonProvider(
      client,
      'SECONDARY_OPENAI_COMPATIBLE',
      model,
      'CHAT_COMPLETIONS',
    );
  }

  const model = requiredEnv('OPENAI_AUTHORING_MODEL');
  const client = new OpenAiCompatibleClient({
    name: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: requiredEnv('OPENAI_API_KEY'),
    allowedHosts: ['api.openai.com'],
    timeoutMs: 180_000,
    maxTransientRetries: 1,
  });
  return new OpenAiCompatibleJsonProvider(client, 'OPENAI', model, 'RESPONSES');
}

function createReviewerProvider(): OpenAiCompatibleJsonProvider {
  const model = requiredEnv('OPENAI_MODEL');
  const client = new OpenAiCompatibleClient({
    name: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: requiredEnv('OPENAI_API_KEY'),
    allowedHosts: ['api.openai.com'],
    timeoutMs: 180_000,
    maxTransientRetries: 1,
  });
  return new OpenAiCompatibleJsonProvider(client, 'OPENAI', model, 'RESPONSES');
}

async function main(): Promise<void> {
  const manifestRunId = argument('--manifest-run');
  if (!manifestRunId) throw new Error('MISSING_REQUIRED_ARGUMENT:--manifest-run');

  const exerciseCount = positiveInteger(argument('--exercise-count'), 12);
  if (exerciseCount < 12 || exerciseCount > 30) {
    throw new Error('EXERCISE_COUNT_MUST_BE_12_TO_30');
  }

  const storage = new ContentFactoryStorageRepository();
  const orchestrator = new ContentFactoryOrchestratorService(prisma);
  const manifestGate = new PrismaCf3ManifestApprovalGate(prisma, storage);
  const approvedA1Targets = await manifestGate.loadApprovedA1Targets(manifestRunId);

  const requestedCodes = (argument('--codes') ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  const selectedTargets = requestedCodes.length
    ? requestedCodes.map((code) => {
        const target = approvedA1Targets.find((item) => item.code === code);
        if (!target) throw new Error(`CF3_TARGET_NOT_IN_APPROVED_MANIFEST:${code}`);
        return target;
      })
    : approvedA1Targets.slice(0, 3);

  if (selectedTargets.length < 3 || selectedTargets.length > 5) {
    throw new Error('CF3_PILOT_SCOPE_MUST_BE_3_TO_5_A1_POINTS');
  }
  if (new Set(selectedTargets.map((target) => target.code)).size !== selectedTargets.length) {
    throw new Error('CF3_PILOT_TARGETS_MUST_BE_UNIQUE');
  }

  const authorProvider = createAuthorProvider();
  const reviewerProvider = createReviewerProvider();
  if (
    authorProvider.provider === reviewerProvider.provider &&
    authorProvider.model === reviewerProvider.model
  ) {
    throw new Error('CF3_REQUIRES_INDEPENDENT_REVIEW_PROVIDER_OR_MODEL');
  }

  const runIdArg = argument('--run-id');
  const run = runIdArg
    ? await prisma.contentFactoryRun.findUniqueOrThrow({ where: { id: runIdArg } })
    : await orchestrator.startRun({
        maxRequests: 100,
        maxInputTokens: 500_000,
        maxOutputTokens: 250_000,
        maxEstimatedCost: 20,
      });

  const grammarAuthor = new LessonGenerator(authorProvider);
  const reviewer = new IndependentContentReviewer(reviewerProvider);
  const exercisePreflight = new ProviderExercisePreflight(reviewerProvider, {
    provider: authorProvider.provider,
    model: authorProvider.model,
  });
  const exerciseFactory = new ExerciseFactory(authorProvider, exercisePreflight);
  const validationRuns = new ContentValidationRunRepository(prisma);
  const reviewRuns = new ContentReviewRunRepository(prisma);
  const pilot = new Cf3PilotService(
    prisma,
    orchestrator,
    manifestGate,
    grammarAuthor,
    reviewer,
    exerciseFactory,
    validationRuns,
    reviewRuns,
    storage,
  );

  const report = await pilot.runPilot({
    runId: run.id,
    manifestRunId,
    targets: selectedTargets,
    exerciseCount,
  });

  console.log(
    JSON.stringify(
      {
        ...report,
        author: { provider: authorProvider.provider, model: authorProvider.model },
        reviewer: { provider: reviewerProvider.provider, model: reviewerProvider.model },
        publicationStatus: 'NOT PUBLISHED',
      },
      null,
      2,
    ),
  );
  if (report.status !== 'READY_FOR_APPROVAL') process.exitCode = 2;
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'CF3_PILOT_FAILED');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
