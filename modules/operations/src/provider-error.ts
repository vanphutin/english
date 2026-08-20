import type { ProviderErrorCode } from './types.js';

export const normalizeProviderError = (
  status: number | undefined,
  providerCode?: string,
): ProviderErrorCode => {
  const code = providerCode?.toLocaleLowerCase('en') ?? '';
  if (status === 401 || status === 403) return 'AUTHENTICATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404 || code.includes('model')) return 'MODEL_UNAVAILABLE';
  if (code.includes('schema') || code.includes('response_format')) return 'SCHEMA_UNSUPPORTED';
  if (status !== undefined && status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'INVALID_RESPONSE';
};

export const isTransientProviderError = (code: ProviderErrorCode): boolean =>
  code === 'RATE_LIMITED' || code === 'TIMEOUT' || code === 'PROVIDER_UNAVAILABLE';
