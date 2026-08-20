# Implementation Roadmap and Order

No feature implementation should begin until the remaining phase 0 decisions are resolved. Each phase exits with tests and usable contracts, not only code.

## Engagement expansion phases (approved order)

### Phase E0 — contracts, provider safety, and measurement

- Approve engagement and provider-routing contracts.
- Add baselines for repetition, activity diversity, completion, retry, and provider cost/failure.
- Build the secondary-provider capability probe and golden corpus; keep learner data disabled.
- Exit: contracts/telemetry pass, no secret is tracked, capability report produced.

### Phase E1 — activity variety and daily choice

- Add versioned contracts/evaluators for correction, transformation, completion, ordering, contextual selection, guided writing, and mini-dialogue.
- Extend authoring validation and selection diversity.
- Add home choices: journey, weakness repair, quick challenge.
- Exit: five-item sessions use at least three types when available; translate flow remains compatible.

### Phase E2 — mistake notebook and remediation

- Add error-pattern projection/rebuild, trend states, owner API/UI, and focused remediation sessions.
- Exit: fixtures rebuild deterministically; resolution requires delayed evidence.

### Phase E3 — unit challenges

- Add multi-target challenge contract, per-target evidence, result UI, and remediation quests.
- Exit: system failures produce zero negative evidence; results are auditable per GrammarPoint.

### Phase E4 — Story Journey MVP

- Add series/chapters/scenes/branches, learner progress, bounded character memory, validation, and a skip-equivalent path.
- Route public-content story drafts to the verified secondary provider with OpenAI/curated fallback.
- Exit: one complete branching A1 series with stable target coverage.

### Phase E5 — interests, achievements, and weekly reflection

- Add topic preferences, meaningful achievement rules, collection UI, and fact-grounded reports.
- Exit: no reward depends on meaningless clicks; every report claim is traceable.

### Phase E6 — gentle consistency and daily surprise

- Add a meaningful-learning calendar, rest/grace behavior, optional validated daily content, and cosmetics.
- Exit: missed days never erase progress or block learning.

### Phase E7 — provider optimization and controlled promotion

- Evaluate secondary cost/quality/availability by purpose.
- Permit Tier 2 only after purpose-specific golden tests; Tier 3 remains shadow-only until explicit owner approval.
- Exit: fallback, circuit breaker, and budgets pass integration tests without quality regression.

## Phase 0 — Confirm foundations

1. Resolve the small set of remaining implementation details in [16-open-decisions.md](./16-open-decisions.md).
2. Initialize Git/monorepo and root engineering guidance.
3. Convert API and structured-data concepts into OpenAPI + JSON Schemas.
4. Add architecture decision records for the approved stack, local identity, OpenAI adapter, AI-first curriculum generation, and content licensing safeguards.

Exit: contracts approved, CI skeleton green, no unresolved decision that changes module/schema fundamentals.

## Phase 1 — Persistence and content foundation

1. Database toolchain and initial migrations.
2. Grammar KB domain, bundle schema/validator/importer, publication workflow.
3. Curriculum release/version graph.
4. Seed a very small validated vertical slice (3-5 GrammarPoints) to prove the pipeline before running full A1-C2 batch generation.

Exit: content validates, publishes immutably, and can be queried through module interfaces.

## Phase 2 — Practice vertical slice without AI dependency

1. Identity/session authorization boundary.
2. Learning session planner and curated/template exercises.
3. Hint reveal history and attempt submission/idempotency.
4. Deterministic/reference evaluator adapter.
5. Minimal learner UI: dashboard -> exercise -> feedback -> summary.

Exit: one complete learning loop works locally and in E2E tests.

## Phase 3 — AI evaluation

1. Provider-neutral AI port and prompt/schema registry.
2. Worker/job/outbox flow, retries, redaction, telemetry.
3. Structured evaluator + deterministic adjudication.
4. Golden corpus, failure/fallback and human override.

Exit: AI improves alternative handling without becoming a domain authority; cost/latency/error metrics visible.

## Phase 4 — Mastery and progression

1. Versioned mastery event policy and projection.
2. Review scheduling and mixed session selection.
3. Level unlock/progress views and rebuild tooling.
4. Boundary/golden tests and product tuning using anonymized metrics.

Exit: all progression is auditable, idempotent, reproducible, and resilient to overrides.

## Phase 5 — Full AI curriculum and exercise generation

Normative implementation sequence and gates are defined by `19-autonomous-content-factory.md` and `contracts/content-factory/`.

1. Structured generator with validation and curated fallback.
2. Batch curriculum-map and GrammarPoint generation through C2, with validation reports and owner bulk approval.
3. Vocabulary sense/hint expansion and leakage checks.
4. Publish curriculum progressively by validated release; never wait for all A1-C2 content before testing lower levels.

## Sequencing prohibitions

- Do not bulk-generate curriculum before schema, editorial workflow, and licensing rules exist.
- Do not tune mastery from unversioned LLM scores.
- Do not build microservices or vector search during MVP without measured need.
- Do not expose an admin publication endpoint before authorization/audit/validation exist.

## Cross-cutting work in every phase

Threat modeling, privacy review, migration notes, observability, accessibility, Vietnamese copy review, contract tests, and updating this directory before behavioral changes.
