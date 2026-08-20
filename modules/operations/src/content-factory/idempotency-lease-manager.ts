import crypto from 'crypto';

export interface IdempotencyKeyInput {
  purpose: string;
  inputHash: string;
  targetCode: string;
  targetVersion: number;
  policyVersion: string;
  schemaVersion: string;
  promptVersion: string;
  attempt: number;
}

/**
 * Job identity pins every contract input that can change generated semantics.
 * A prompt/schema change therefore creates a new job instead of reusing stale evidence.
 */
export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  const raw = [
    input.purpose,
    input.targetCode,
    `v${input.targetVersion}`,
    input.policyVersion,
    `schema:${input.schemaVersion}`,
    `prompt:${input.promptVersion}`,
    `att${input.attempt}`,
    input.inputHash,
  ].join(':');
  const sha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return `cf-job-${input.targetCode}-att${input.attempt}-${sha256.substring(0, 32)}`;
}

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function isLeaseExpired(leaseExpiresAt: Date | null | undefined): boolean {
  if (!leaseExpiresAt) return true;
  return leaseExpiresAt.getTime() <= Date.now();
}
