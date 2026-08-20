import { isTransientProviderError, normalizeProviderError } from './provider-error.js';
import type { ProviderConfiguration, ProviderErrorCode, ProviderResult } from './types.js';

type FetchLike = typeof fetch;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class OpenAiCompatibleClient {
  private readonly baseUrl: URL;

  constructor(
    private readonly configuration: ProviderConfiguration,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.baseUrl = this.validateBaseUrl(configuration.baseUrl, configuration.allowedHosts);
  }

  get host(): string {
    return this.baseUrl.host;
  }

  async listModels(): Promise<ProviderResult<string[]>> {
    const result = await this.request<{ data?: Array<{ id?: string }> }>('models', {
      method: 'GET',
    });
    if (!result.ok) return result as ProviderResult<string[]>;
    const models = result.value?.data?.flatMap((item) => (item.id ? [item.id] : []));
    if (!models) return { ok: false, errorCode: 'INVALID_RESPONSE', latencyMs: result.latencyMs };
    return { ...result, value: [...new Set(models)].sort() };
  }

  chatCompletion(
    model: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    responseFormat?: Record<string, unknown>,
  ): Promise<ProviderResult<unknown>> {
    return this.request('chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });
  }

  createResponse(
    model: string,
    instructions: string,
    input: string,
    text?: Record<string, unknown>,
  ): Promise<ProviderResult<unknown>> {
    return this.request('responses', {
      method: 'POST',
      body: JSON.stringify({ model, instructions, input, ...(text ? { text } : {}) }),
    });
  }

  private validateBaseUrl(rawUrl: string, allowedHosts: string[]): URL {
    const url = new URL(rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`);
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.host))
      throw new Error('ENDPOINT_NOT_ALLOWED');
    return url;
  }

  /** Retries only transient transport/provider failures; auth and schema failures fail closed. */
  private async request<T>(path: string, init: RequestInit): Promise<ProviderResult<T>> {
    let finalResult: ProviderResult<T> | undefined;
    for (let attempt = 0; attempt <= this.configuration.maxTransientRetries; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await this.fetcher(new URL(path, this.baseUrl), {
          ...init,
          headers: {
            Authorization: `Bearer ${this.configuration.apiKey}`,
            'Content-Type': 'application/json',
            ...init.headers,
          },
          signal: AbortSignal.timeout(this.configuration.timeoutMs),
        });
        const payload = (await response.json().catch(() => null)) as
          (T & { error?: { code?: string } }) | null;
        if (response.ok && payload !== null)
          return {
            ok: true,
            value: payload,
            status: response.status,
            latencyMs: Date.now() - startedAt,
            ...(response.headers.get('x-request-id')
              ? { requestId: response.headers.get('x-request-id')! }
              : {}),
          };
        const errorCode = normalizeProviderError(response.status, payload?.error?.code);
        finalResult = {
          ok: false,
          errorCode,
          status: response.status,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error: unknown) {
        const errorCode: ProviderErrorCode =
          error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'TIMEOUT'
            : 'PROVIDER_UNAVAILABLE';
        finalResult = { ok: false, errorCode, latencyMs: Date.now() - startedAt };
      }
      if (!finalResult.errorCode || !isTransientProviderError(finalResult.errorCode)) break;
      if (attempt < this.configuration.maxTransientRetries) await sleep(200 * 2 ** attempt);
    }
    return finalResult ?? { ok: false, errorCode: 'INVALID_RESPONSE', latencyMs: 0 };
  }
}
