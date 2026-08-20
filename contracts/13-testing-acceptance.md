# Testing and Acceptance Criteria

## Test pyramid

- **Domain unit tests:** pure grammar validators, adjudication, mastery, review, unlock and selection policies.
- **Schema/contract tests:** OpenAPI requests/responses; grammar bundle and AI JSON Schemas; backward compatibility.
- **Integration tests:** repositories and transactions against real PostgreSQL; outbox/idempotency/concurrency.
- **Provider adapter tests:** recorded/synthetic responses; never require paid live AI calls in normal CI.
- **End-to-end:** start/resume session, reveal hint, submit, pending evaluation, retry/accept, summary.
- **Content regression:** curated evaluator corpus and grammar publication validation.

## Mandatory acceptance criteria

### Grammar/content

- Invalid references, duplicate codes, incomplete versions, cycles, and invalid examples block publication.
- Published content is immutable and a release pins exact versions/hashes.

### Exercise

- Every shown item has target, semantic requirements, references, provenance, rubric, and immutable snapshot.
- Ambiguous/invalid/unsafe generated items are rejected; fallback does not penalize the learner.
- Hint leakage checks cover target auxiliaries/forms and full-answer reconstruction.

### Evaluation

- Correct natural alternatives are accepted even when absent from reference answers.
- Meaning loss and target avoidance are distinguished from other minor errors.
- Malformed/prompt-injected/contradictory AI output cannot reach mastery.
- Provider timeout/retry/duplicate completion produces at most one effective evaluation.

### Mastery

- Hint-assisted/retried answers weigh less than independent first-attempt success.
- System failure weighs zero.
- Duplicate events do not double-apply.
- Rebuild from event ledger yields the same projection for a fixed policy version.
- Unlock fixtures cover boundary thresholds and prerequisite failures.

### API/UI/security

- Users cannot access another user's sessions, attempts, hints, or mastery.
- Mutation retry with the same idempotency key is safe; mismatched payload conflicts.
- Refresh during evaluation resumes correctly; draft/submitted answer is not lost.
- Logs and analytics omit secrets and learner answer text by default.
- Accessibility smoke tests cover keyboard, focus, labels, live feedback, and color independence.
- Engagement tests cover activity diversity, non-punitive failure, story branch invariants, error-notebook rebuild, achievement idempotency, and traceable progress claims.
- Provider contract tests cover capability probes, schema incompatibility, 401/429/5xx normalization, bounded retry, circuit breaking, fallback, shadow-only Tier 3, and secret redaction.

## Quality gates

- Zero type/lint errors.
- Domain policy branch coverage target >= 90%; overall percentage is secondary to critical-case coverage.
- All migrations apply to an empty database and upgrade the previous supported schema.
- No unresolved high/critical security finding.
- Evaluator release passes a versioned golden corpus at agreed thresholds; failures require explicit review, not snapshot overwrite.

## Performance budgets (proposed)

- Non-AI API p95 < 500 ms under expected MVP load.
- Attempt acknowledgement < 1 s; AI result target p95 < 8 s, with asynchronous UX beyond that.
- Session resume returns bounded payloads and avoids per-item query loops.
