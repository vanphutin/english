import { describe, expect, it } from 'vitest';
import type { OpenAiCompatibleClient } from '../openai-compatible-client.js';
import { OpenAiCompatibleJsonProvider } from './ai-content-provider.js';

describe('OpenAiCompatibleJsonProvider error normalization', () => {
  it('puts authentication failure first so coordinator hard-stop logic sees it', async () => {
    const client = {
      createResponse: async () => ({
        ok: false as const,
        errorCode: 'AUTHENTICATION_FAILED' as const,
      }),
    } as unknown as OpenAiCompatibleClient;
    const provider = new OpenAiCompatibleJsonProvider(
      client,
      'OPENAI',
      'test-model',
      'RESPONSES',
    );

    await expect(
      provider.generateJson({
        purpose: 'AUTHOR_GRAMMAR',
        system: 'system',
        input: '{}',
      }),
    ).rejects.toThrow('AUTHENTICATION_FAILED:CONTENT_FACTORY_PROVIDER_FAILED:AUTHOR_GRAMMAR');
  });
});
