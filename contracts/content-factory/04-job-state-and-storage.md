# Job State, Idempotency, and Storage Contract

## Aggregates

- `ContentFactoryRun`: requested manifest/batch scope, policy, budgets, status, totals.
- `ContentGenerationJob`: one purpose and bounded artifact target.
- `ContentArtifact`: immutable input/output snapshots and hashes.
- `ContentValidationRun`: validator versions and structured findings.
- `ContentReviewRun`: reviewer metadata and report hash.
- `ContentApproval`: owner decision, scope hash, rationale, timestamp.
- `ContentPublication`: published IDs/versions/hashes and transaction result.

## Job state machine

`QUEUED -> CLAIMED -> GENERATING -> GENERATED -> VALIDATING -> IN_REVIEW -> READY_FOR_APPROVAL -> APPROVED -> PUBLISHING -> SUCCEEDED`

Failure states: `CHANGES_REQUESTED`, `RETRY_WAIT`, `QUARANTINED`, `REJECTED`, `CANCELLED`, `FAILED`. Only a lease owner may advance an active job. Expired leases are reclaimable. Terminal artifacts remain immutable.

## Idempotency

Job identity is derived from purpose, approved input hash, target code/version, policy/schema/prompt versions, and attempt. Re-delivery with the same identity returns the existing result. Changed intent requires a new job. Provider retries cannot create duplicate artifacts, reviews, approvals, or publications.

## Budgets and resilience

Runs pin maximum requests, input/output tokens, estimated cost, wall-clock window, concurrent jobs, attempts, and batch size. Authentication/schema/safety failures do not retry. Transient timeout/429/5xx follows provider policy. Budget exhaustion pauses safely; it never publishes partial unapproved scope.

## Data safety

Persist safe metadata and normalized structured artifacts. Never store keys, authorization headers, provider raw request/response envelopes, chain-of-thought, learner answers, or personal story state. Content snapshots are `PUBLIC_CONTENT` only.

Machine authority: `content-factory-job.schema.json`.
