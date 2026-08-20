import { describe, expect, it } from 'vitest';
import { isTransientProviderError, normalizeProviderError } from './provider-error.js';

describe('provider error normalization', () => {
  it.each([
    [401, undefined, 'AUTHENTICATION_FAILED'],
    [403, undefined, 'AUTHENTICATION_FAILED'],
    [429, undefined, 'RATE_LIMITED'],
    [404, undefined, 'MODEL_UNAVAILABLE'],
    [400, 'json_schema_unsupported', 'SCHEMA_UNSUPPORTED'],
    [503, undefined, 'PROVIDER_UNAVAILABLE'],
  ] as const)('normalizes status %s', (status, providerCode, expected) => {
    expect(normalizeProviderError(status, providerCode)).toBe(expected);
  });

  it('retries only transient failures', () => {
    expect(isTransientProviderError('RATE_LIMITED')).toBe(true);
    expect(isTransientProviderError('TIMEOUT')).toBe(true);
    expect(isTransientProviderError('AUTHENTICATION_FAILED')).toBe(false);
    expect(isTransientProviderError('SCHEMA_UNSUPPORTED')).toBe(false);
  });
});
