# Content Factory Implementation and Acceptance Phases

## CF0 — Contracts and fixtures

Implement schemas, reason-code registry, contract validation examples, and dry-run fixtures. Exit: invalid/malicious samples fail deterministically.

## CF1 — Durable orchestration

Add run/job/artifact/validation/review/approval/publication models, leases, idempotency, budgets, CLI/status API, and worker handlers. Exit: interruption/re-delivery produces no duplicates.

## CF2 — Manifest planner

Generate and validate a full A1–C2 proposal without lesson bodies. Exit: coverage report, acyclic graph, duplicate/granularity review, owner-approved manifest hash.

## CF3 — A1 pilot

Generate 3–5 A1 points and exercise banks through all gates. Exit: fixtures pass, no unresolved severe findings, owner approval and reversible isolated publication.

## CF4 — Level batches

Process A1, A2, B1, B2, C1, C2 in bounded sub-batches with regression after each. C1/C2 require enhanced reviewer escalation. Exit: each level meets coverage and exercise readiness independently.

## CF5 — Curriculum release

Create a new immutable release that pins approved points, compare against the existing 62-point release, run learner-flow regression, and require explicit activation approval.

## Required tests

Schema positives/negatives; graph cycles/missing/symmetry; code/version conflicts; Unicode/mojibake; CEFR/vocabulary; duplicate/contradiction; unsafe/license; target necessity/ambiguity/leakage; reviewer prompt injection/malformed output; leases/concurrency/idempotency; provider retry/budget/circuit; approval hash mismatch; transactional publish failure; immutable history; old-release learner regression.

Definition of done: contract validation, database validation, format, lint, typecheck, unit/integration/provider/content regression, relevant builds, empty/upgrade migrations, dry-run report, and explicit remaining owner approvals all pass.
