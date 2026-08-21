import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createCf4Runtime } from './cf4-runtime.js';

const prisma = {} as PrismaClient;

function openAiEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    OPENAI_API_KEY: 'test-key',
    OPENAI_AUTHORING_MODEL: 'author-model',
    OPENAI_REVIEW_MODEL: 'review-model',
    CONTENT_FACTORY_AUTHOR_PROVIDER: 'OPENAI',
    ...overrides,
  };
}

describe('createCf4Runtime', () => {
  it('composes independent OpenAI author/reviewer/preflight roles', async () => {
    const runtime = await createCf4Runtime({
      prisma,
      runId: '11111111-1111-4111-8111-111111111111',
      env: openAiEnv(),
    });

    expect(runtime.providers).toEqual({
      author: { provider: 'OPENAI', model: 'author-model' },
      reviewer: { provider: 'OPENAI', model: 'review-model' },
      preflight: { provider: 'OPENAI', model: 'review-model' },
      secondaryProbeStatus: 'NOT_USED',
    });
  });

  it('requires an explicit reviewer model instead of silently reusing the author model', async () => {
    await expect(
      createCf4Runtime({
        prisma,
        runId: '11111111-1111-4111-8111-111111111111',
        env: openAiEnv({ OPENAI_REVIEW_MODEL: undefined }),
      }),
    ).rejects.toThrow('OPENAI_REVIEW_MODEL_REQUIRED');
  });

  it('rejects OpenAI author/reviewer model aliasing', async () => {
    await expect(
      createCf4Runtime({
        prisma,
        runId: '11111111-1111-4111-8111-111111111111',
        env: openAiEnv({ OPENAI_REVIEW_MODEL: 'author-model' }),
      }),
    ).rejects.toThrow('CONTENT_FACTORY_REVIEWER_INDEPENDENCE_CONFIG_REQUIRED');
  });

  it('rejects secondary authoring before probing when golden approval is absent', async () => {
    await expect(
      createCf4Runtime({
        prisma,
        runId: '11111111-1111-4111-8111-111111111111',
        env: openAiEnv({
          CONTENT_FACTORY_AUTHOR_PROVIDER: 'SECONDARY',
          SECONDARY_AI_ENABLED: 'true',
          CONTENT_FACTORY_SECONDARY_GOLDEN_APPROVED: 'false',
        }),
      }),
    ).rejects.toThrow('SECONDARY_AI_GOLDEN_APPROVAL_REQUIRED');
  });

  it('rejects invalid numeric budget config before execution', async () => {
    await expect(
      createCf4Runtime({
        prisma,
        runId: '11111111-1111-4111-8111-111111111111',
        env: openAiEnv({ CONTENT_FACTORY_PREFLIGHT_OUTPUT_TOKENS: '0' }),
      }),
    ).rejects.toThrow('CF4_RUNTIME_INTEGER_CONFIG_INVALID');
  });
});
