import crypto from 'crypto';

export interface IdempotencyKeyInput {
  purpose: string;
  inputHash: string;
  targetCode: string;
  targetVersion: number;
  policyVersion: string;
  attempt: number;
}

export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  const raw = `${input.purpose}:${input.targetCode}:v${input.targetVersion}:${input.policyVersion}:att${input.attempt}:${input.inputHash}`;
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
