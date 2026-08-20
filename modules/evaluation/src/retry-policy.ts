const TRANSIENT_CODES = new Set(['TIMEOUT', 'PROVIDER_ERROR', 'HTTP_408', 'HTTP_409', 'HTTP_429']);

export const isRetryableProviderError = (errorCode: string | undefined): boolean => {
  if (!errorCode) return true;
  if (TRANSIENT_CODES.has(errorCode)) return true;
  const match = /^HTTP_(\d{3})$/.exec(errorCode);
  return match ? Number(match[1]) >= 500 : false;
};

export const retryDelaySeconds = (attempts: number): number =>
  Math.min(300, 2 ** Math.max(1, attempts) * 5);
