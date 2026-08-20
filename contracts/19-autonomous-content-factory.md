# Autonomous Content Factory — Governing Contract

Status: **Approved for contract-first implementation**  
Policy version: `content-factory-v1`

## Goal

Allow Antigravity to plan and generate a complete Vietnamese-first A1–C2 grammar curriculum and validated exercise bank while treating every AI output as untrusted draft content. Generation may be autonomous; publication is deterministic, versioned, auditable, and owner-controlled.

Target envelope is 230–265 assessable GrammarPoints and at least 12 validated exercises per published point. Initial targets are A1/A2 `20`, B1/B2 `24`, and C1/C2 `30` exercises per point. Quantity never overrides quality gates.

## Mandatory reading order

1. `contracts/README.md`, `00`–`07`, `12`–`16`, and `18`.
2. This governing contract.
3. Every file in `contracts/content-factory/` in its README order.
4. Machine authorities in `packages/contracts/schemas/`.

## Authority boundaries

- Existing contracts own product meaning, module boundaries, GrammarPoint semantics, evaluation, mastery, provider routing, and publication immutability.
- The approved curriculum manifest owns desired point identity, granularity, CEFR placement, unit placement, and relationships.
- Grammar bundles and exercises own immutable content snapshots only after publication.
- Prompts, model suggestions, agent memory, UI labels, and provider responses are never authority.
- Antigravity MAY create plans, drafts, revisions, review reports, fixtures, and validation artifacts. It MUST NOT directly set `PUBLISHED`, modify a published version, award mastery, change unlocks, or invent new policy.

## Required pipeline

`MANIFEST_DRAFT -> MANIFEST_VALIDATED -> MANIFEST_APPROVED -> AUTHORING -> DETERMINISTIC_VALIDATION -> INDEPENDENT_REVIEW -> FIXTURE_VALIDATION -> READY_FOR_APPROVAL -> OWNER_APPROVED -> PUBLISHED`

Any failed gate transitions to `CHANGES_REQUESTED`, `REJECTED`, or `QUARANTINED`. Retry is bounded and creates a new attempt; it never erases prior artifacts.

## Separation of duties

- `PLANNER`: proposes the full map; cannot author bodies before manifest approval.
- `GRAMMAR_AUTHOR`: writes one bounded GrammarPoint bundle from an approved manifest item.
- `EXERCISE_AUTHOR`: writes exercises only against an exact validated GrammarPoint version.
- `REVIEWER`: receives artifacts without author reasoning and returns structured findings.
- `DETERMINISTIC_VALIDATOR`: code-owned schemas, graph, duplicate, safety, coverage, leakage, and fixture checks.
- `PUBLISHER`: deterministic application service requiring every recorded gate and owner approval.

The same AI call MUST NOT be both author and final reviewer. Provider/model may match only when no alternative is available, but prompt/run IDs and contexts remain separate and this limitation is recorded.

## Provider policy

Content authoring is Tier 1 `PUBLIC_CONTENT`. A probed secondary provider may draft. OpenAI is the preferred reviewer for uncertain, advanced, conflicting, or repeatedly failed content. Provider selection follows `18-ai-provider-routing.md`; Antigravity never reads or prints keys and never chooses arbitrary endpoints/models.

## Global invariants

- Stable codes are never reused. Published versions are immutable.
- One GrammarPoint is one independently assessable form–meaning–use distinction.
- All graph references resolve inside the approved manifest or existing published KB; hard prerequisites are acyclic.
- CEFR is an internal editorial estimate, not certification.
- No copyrighted curriculum scraping, disguised copying, or unverifiable source claims.
- Vietnamese must be valid UTF-8, natural, and free of mojibake.
- Generated exercises cannot enter learner selection until the pinned point and exercise are published.
- Every artifact records schema, policy, prompt, provider/model, input hash, output hash, attempt, timestamps, validator/reviewer results, and source/license declaration.

## Completion definition

The factory is complete only when Antigravity can resume an interrupted run idempotently, generate bounded batches, reject invalid output without learner exposure, produce owner-readable reports, and publish only explicitly approved immutable batches. “The model returned JSON” is never completion.
