import type { ContentFactoryJobState } from '@prisma/client';

export const ALLOWED_STATE_TRANSITIONS: Record<ContentFactoryJobState, ContentFactoryJobState[]> = {
  QUEUED: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['GENERATING', 'VALIDATING', 'QUARANTINED', 'FAILED', 'RETRY_WAIT', 'CANCELLED'],
  GENERATING: [
    'GENERATED',
    'VALIDATING',
    'CHANGES_REQUESTED',
    'FAILED',
    'RETRY_WAIT',
    'QUARANTINED',
    'CANCELLED',
  ],
  GENERATED: ['VALIDATING', 'FAILED', 'CANCELLED'],
  VALIDATING: [
    'IN_REVIEW',
    'READY_FOR_APPROVAL',
    'CHANGES_REQUESTED',
    'FAILED',
    'RETRY_WAIT',
    'QUARANTINED',
    'REJECTED',
    'CANCELLED',
  ],
  IN_REVIEW: [
    'READY_FOR_APPROVAL',
    'CHANGES_REQUESTED',
    'FAILED',
    'RETRY_WAIT',
    'QUARANTINED',
    'REJECTED',
    'CANCELLED',
  ],
  READY_FOR_APPROVAL: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED'],
  APPROVED: ['PUBLISHING', 'CANCELLED'],
  PUBLISHING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [], // Terminal
  CHANGES_REQUESTED: ['QUEUED', 'CANCELLED'],
  RETRY_WAIT: ['QUEUED', 'QUARANTINED', 'CANCELLED'],
  QUARANTINED: [], // Terminal
  REJECTED: [], // Terminal
  CANCELLED: [], // Terminal
  FAILED: ['RETRY_WAIT', 'QUARANTINED'],
};

export function canTransitionState(
  fromState: ContentFactoryJobState,
  toState: ContentFactoryJobState,
): boolean {
  const allowed = ALLOWED_STATE_TRANSITIONS[fromState];
  return allowed ? allowed.includes(toState) : false;
}

export function isTerminalState(state: ContentFactoryJobState): boolean {
  return (
    state === 'SUCCEEDED' ||
    state === 'QUARANTINED' ||
    state === 'REJECTED' ||
    state === 'CANCELLED'
  );
}
