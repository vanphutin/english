import { describe, expect, it } from 'vitest';
import { probeOpenAiCompatibleProvider } from './capability-probe.js';
import type { OpenAiCompatibleClient } from './openai-compatible-client.js';

const result = (value: unknown) => ({ ok: true, value, latencyMs: 1, status: 200 });

describe('provider capability probe', () => {
  it('accepts OpenAI-compatible array text content and keeps Responses optional', async () => {
    let chatCall = 0;
    const client = {
      host: 'api.example.test',
      listModels: () => Promise.resolve(result(['model-a'])),
      chatCompletion: () => {
        chatCall += 1;
        const text =
          chatCall === 1
            ? 'READY'
            : chatCall === 2
              ? 'Tôi đang học tiếng Việt và tiếng Anh.'
              : chatCall === 3
                ? '{"ok":true,"language":"vi"}'
                : 'SAFE';
        return Promise.resolve(
          result({ choices: [{ message: { content: [{ type: 'text', text }] } }] }),
        );
      },
      createResponse: () =>
        Promise.resolve({
          ok: false,
          errorCode: 'INVALID_RESPONSE' as const,
          latencyMs: 1,
        }),
    } as unknown as OpenAiCompatibleClient;

    const report = await probeOpenAiCompatibleProvider(client, {
      provider: 'SECONDARY_OPENAI_COMPATIBLE',
      now: new Date('2026-08-17T00:00:00.000Z'),
    });
    expect(report.status).toBe('VERIFIED');
    expect(report.checks.find((item) => item.capability === 'RESPONSES')?.status).toBe(
      'UNSUPPORTED',
    );
    expect(report).not.toHaveProperty('apiKey');
  });
});
