import { describe, expect, it } from 'vitest';
import { isRetryableProviderError, retryDelaySeconds } from './retry-policy.js';

describe('provider retry policy', () => {
  it('retries transient timeouts, throttling, and server errors', () => {
    expect(isRetryableProviderError('TIMEOUT')).toBe(true);
    expect(isRetryableProviderError('HTTP_429')).toBe(true);
    expect(isRetryableProviderError('HTTP_503')).toBe(true);
  });

  it('does not retry configuration or schema failures', () => {
    expect(isRetryableProviderError('OPENAI_API_KEY_MISSING')).toBe(false);
    expect(isRetryableProviderError('INVALID_STRUCTURED_OUTPUT')).toBe(false);
    expect(isRetryableProviderError('HTTP_401')).toBe(false);
  });

  it('uses bounded exponential delay', () => {
    expect(retryDelaySeconds(1)).toBe(10);
    expect(retryDelaySeconds(4)).toBe(80);
    expect(retryDelaySeconds(20)).toBe(300);
  });
});
