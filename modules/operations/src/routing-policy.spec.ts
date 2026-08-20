import { describe, expect, it } from 'vitest';
import { decideProviderRoute } from './routing-policy.js';
import type { CapabilityReport } from './types.js';

const report: CapabilityReport = {
  schemaVersion: '1.0',
  probeVersion: 'test',
  provider: 'SECONDARY_OPENAI_COMPATIBLE',
  baseHost: 'api.example.test',
  probedAt: '2026-08-17T00:00:00.000Z',
  status: 'PARTIAL',
  selectedModel: 'model-a',
  models: ['model-a'],
  checks: [
    { capability: 'AUTH_MODELS', status: 'PASS', latencyMs: 1 },
    { capability: 'CHAT_COMPLETIONS', status: 'PASS', latencyMs: 1 },
    { capability: 'VIETNAMESE_UNICODE', status: 'PASS', latencyMs: 1 },
    { capability: 'STRUCTURED_OUTPUT', status: 'FAIL', latencyMs: 1 },
    { capability: 'PROMPT_INJECTION_BOUNDARY', status: 'PASS', latencyMs: 1 },
  ],
};

describe('AI provider routing policy', () => {
  it('uses the secondary only for verified public text-draft capabilities', () => {
    expect(
      decideProviderRoute({
        purpose: 'STORY_DRAFT',
        privacyClass: 'PUBLIC_CONTENT',
        deterministicSufficient: false,
        requiresStructuredOutput: false,
        secondaryReport: report,
        secondaryHealthy: true,
        openAiAvailable: true,
      }),
    ).toEqual({
      provider: 'SECONDARY_OPENAI_COMPATIBLE',
      reason: 'SECONDARY_CAPABILITY_VERIFIED',
    });
  });

  it('keeps structured drafts and learner evaluation on OpenAI', () => {
    expect(
      decideProviderRoute({
        purpose: 'EXERCISE_DRAFT',
        privacyClass: 'PUBLIC_CONTENT',
        deterministicSufficient: false,
        requiresStructuredOutput: true,
        secondaryReport: report,
        secondaryHealthy: true,
        openAiAvailable: true,
      }).provider,
    ).toBe('OPENAI');
    expect(
      decideProviderRoute({
        purpose: 'GRAMMAR_EVALUATION',
        privacyClass: 'PSEUDONYMOUS_LEARNING',
        deterministicSufficient: false,
        requiresStructuredOutput: true,
        secondaryReport: report,
        secondaryHealthy: true,
        openAiAvailable: true,
      }),
    ).toEqual({ provider: 'OPENAI', reason: 'PRIMARY_REQUIRED' });
  });

  it('fails safely when no eligible provider exists', () => {
    expect(
      decideProviderRoute({
        purpose: 'GRAMMAR_EVALUATION',
        privacyClass: 'PSEUDONYMOUS_LEARNING',
        deterministicSufficient: false,
        requiresStructuredOutput: true,
        secondaryReport: report,
        secondaryHealthy: true,
        openAiAvailable: false,
      }).provider,
    ).toBe('SAFE_FALLBACK');
  });
});
