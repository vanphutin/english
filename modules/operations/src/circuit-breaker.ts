export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Small in-process health guard; persisted health events remain an Operations concern. */
export class ProviderCircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | undefined;

  constructor(
    private readonly policy: {
      failureThreshold: number;
      rollingWindowMs: number;
      openDurationMs: number;
    },
  ) {}

  state(now = Date.now()): CircuitState {
    this.prune(now);
    if (this.openedAt === undefined) return 'CLOSED';
    return now - this.openedAt >= this.policy.openDurationMs ? 'HALF_OPEN' : 'OPEN';
  }

  canRequest(now = Date.now()): boolean {
    return this.state(now) !== 'OPEN';
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = undefined;
  }

  recordFailure(now = Date.now()): void {
    this.prune(now);
    this.failures.push(now);
    if (this.failures.length >= this.policy.failureThreshold) this.openedAt = now;
  }

  private prune(now: number): void {
    this.failures = this.failures.filter(
      (timestamp) => now - timestamp <= this.policy.rollingWindowMs,
    );
  }
}
