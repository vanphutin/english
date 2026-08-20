# Implementation Phases

Status: active  
Target: a complete local, single-user web application from A1 through C2.

## Phase 1 — Complete the backend learning loop

Status: complete (2026-08-16)

- Versioned mastery evidence policy and immutable event ledger.
- Idempotent mastery projection per grammar point.
- Session resume/completion and progress endpoints.
- Review scheduling fields and deterministic tests.

Exit: an accepted/retried answer produces auditable mastery evidence exactly once and progress can be read through the API.

## Phase 2 — Production AI evaluation

Status: complete (2026-08-16)

- Verify the configured OpenAI model and API key without exposing secrets.
- Move non-deterministic evaluation to the persistent worker/outbox flow.
- Add retries, timeouts, redacted telemetry, and provider failure recovery.
- Add a versioned golden evaluator corpus.

Exit: alternative answers are evaluated reliably and duplicate jobs produce one effective result.

## Phase 3 — Usable learner web application

Status: complete (2026-08-16)

- Login/logout, dashboard, session start/resume.
- Exercise editor, local draft recovery, submission, evaluation polling, feedback, retry.
- Session summary and progress display.
- Loading, empty, unauthorized, offline/retry and accessible interaction states.

Exit: the complete learning loop is usable from the browser without API tooling.

## Phase 4 — Vocabulary, hints, review, and progression

Status: complete (2026-08-16)

- Progressive vocabulary hints with leakage checks and reveal history.
- 40/35/25 new/review/weak session selection.
- Level progress, prerequisites, unlock decisions, and rebuild tooling.

Exit: review and progression are reproducible from evidence and earlier grammar remains in practice.

## Phase 5 — Curriculum and exercise content A1 through C2

Status: complete (2026-08-16)

- A1 and A2 published in curriculum release 2 with 20 GrammarPoints and 20 exercises.
- B1 and B2 published in curriculum release 3; the active A1–B2 path has 40 GrammarPoints and 40 exercises.
- C1 and C2 published in curriculum release 4; the active A1–C2 path has 62 GrammarPoints and 62 exercises.
- Generate later CEFR content in bounded batches through the structured AI authoring pipeline.
- Validate graph integrity, duplication, licensing provenance, evaluator fixtures, and owner approval before publication.
- Expand curated/generated exercise and vocabulary coverage per published release.

Exit: every level A1–C2 has a validated, versioned, published path with sufficient practice coverage.

## Phase 6 — Release readiness

Status: complete (2026-08-17)

- End-to-end and accessibility regression suite added for the critical learner flow.
- Timestamped backup, guarded restore, and local data recovery workflow added.
- Security/privacy review, operational diagnostics, and setup documentation complete.
- Clean local release with one-command startup and health checks complete.

Exit: the owner can install, run, learn, back up, restore, and upgrade the application locally.
