import { describe, expect, it } from 'vitest';
import { computeIdempotencyKey } from './idempotency-lease-manager.js';

const base = {
  purpose: 'AUTHOR_GRAMMAR',
  inputHash: 'a'.repeat(64),
  targetCode: 'A1_TEST_POINT',
  targetVersion: 1,
  policyVersion: 'content-factory-v1',
  schemaVersion: '1.0',
  promptVersion: 'cf3-author-v1',
  attempt: 1,
};

describe('Content Factory idempotency key', () => {
  it('is stable for identical intent', () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base }));
  });

  it('changes when prompt or schema version changes', () => {
    const original = computeIdempotencyKey(base);
    expect(computeIdempotencyKey({ ...base, promptVersion: 'cf3-author-v2' })).not.toBe(original);
    expect(computeIdempotencyKey({ ...base, schemaVersion: '2.0' })).not.toBe(original);
  });
});
