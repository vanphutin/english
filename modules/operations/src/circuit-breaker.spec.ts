import { describe, expect, it } from 'vitest';
import { ProviderCircuitBreaker } from './circuit-breaker.js';

describe('provider circuit breaker', () => {
  it('opens after threshold, becomes half-open, and closes on success', () => {
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 3,
      rollingWindowMs: 10_000,
      openDurationMs: 5_000,
    });
    breaker.recordFailure(1_000);
    breaker.recordFailure(2_000);
    expect(breaker.state(2_000)).toBe('CLOSED');
    breaker.recordFailure(3_000);
    expect(breaker.state(3_100)).toBe('OPEN');
    expect(breaker.canRequest(3_100)).toBe(false);
    expect(breaker.state(8_000)).toBe('HALF_OPEN');
    breaker.recordSuccess();
    expect(breaker.state(8_001)).toBe('CLOSED');
  });
});
