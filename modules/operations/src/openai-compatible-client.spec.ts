import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleClient } from './openai-compatible-client.js';

const configuration = {
  name: 'SECONDARY_OPENAI_COMPATIBLE' as const,
  baseUrl: 'https://api.example.test/v1',
  apiKey: 'test-key-not-a-secret',
  allowedHosts: ['api.example.test'],
  timeoutMs: 1_000,
  maxTransientRetries: 2,
};

describe('OpenAiCompatibleClient', () => {
  it('rejects non-allowlisted or non-HTTPS endpoints', () => {
    expect(
      () =>
        new OpenAiCompatibleClient({
          ...configuration,
          baseUrl: 'http://api.example.test/v1',
        }),
    ).toThrow('ENDPOINT_NOT_ALLOWED');
    expect(
      () =>
        new OpenAiCompatibleClient({
          ...configuration,
          baseUrl: 'https://attacker.example/v1',
        }),
    ).toThrow('ENDPOINT_NOT_ALLOWED');
  });

  it('lists models without exposing authorization in its result', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const client = new OpenAiCompatibleClient(configuration, fetcher);
    await expect(client.listModels()).resolves.toMatchObject({
      ok: true,
      value: ['model-a', 'model-b'],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries 429 but does not retry authentication failure', async () => {
    const retryFetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), { status: 200 }),
      );
    const retryClient = new OpenAiCompatibleClient(configuration, retryFetcher);
    await expect(retryClient.listModels()).resolves.toMatchObject({ ok: true });
    expect(retryFetcher).toHaveBeenCalledTimes(2);

    const authFetcher = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: {} }), { status: 401 })),
    );
    const authClient = new OpenAiCompatibleClient(configuration, authFetcher);
    await expect(authClient.listModels()).resolves.toMatchObject({
      ok: false,
      errorCode: 'AUTHENTICATION_FAILED',
    });
    expect(authFetcher).toHaveBeenCalledTimes(1);
  });
});
