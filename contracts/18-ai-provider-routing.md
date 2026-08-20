# AI Provider Routing and Cost-Control Contract

Status: **Approved architecture; third-party capabilities unverified until probe**  
Contract version: `0.1.0`

## Goal

Reduce AI cost through a configurable OpenAI-compatible secondary provider while preserving evaluation quality, privacy, reproducibility, and safe degradation. Providers are adapters; no provider owns curriculum, story truth, progression, mastery, rewards, or authorization.

## Configured providers

- `OPENAI`: primary quality/fallback provider using the supported OpenAI API.
- `SECONDARY_OPENAI_COMPATIBLE`: optional cost-saving provider with an operator-configured HTTPS base URL and key. Initial candidate base URL: `https://api.17.wtf/v1`.

The candidate's public claims are not evidence of exact compatibility. Model IDs, protocols, structured-output behavior, limits, privacy, retention, availability, and upstream provenance remain `UNVERIFIED` until recorded probes pass.

## Secret and endpoint rules

- Keys exist only in local environment/secret storage and MUST NOT appear in Git, contracts, content snapshots, logs, errors, analytics, prompts, or browser bundles.
- Base URLs are operator configuration validated against an exact HTTPS allowlist. Learner input can never choose a URL, model, or provider.
- Never forward one provider's key to another provider.
- Redact authorization headers and query strings at every logging boundary.
- A key exposed in chat, screenshots, logs, or commits SHOULD be rotated.

## Capability registry and probe

Each `(provider, model)` has a versioned capability record: protocol (`RESPONSES | CHAT_COMPLETIONS | ANTHROPIC_MESSAGES`), structured-schema support, verified size limits, instruction behavior, timeout/rate-limit semantics, usage metadata, allowed purposes, last probe, probe version, and status.

Before enabling a provider/model:

1. Verify TLS and exact configured host.
2. Authenticate and list models when supported.
3. Run a minimal deterministic request and Vietnamese Unicode round-trip.
4. Test strict structured output and malformed-output rejection.
5. Test timeout, 401, 429, 5xx, and unavailable-model normalization.
6. Run prompt-injection fixtures with learner text treated as data.
7. Run the versioned golden corpus for the intended purpose.
8. Record safe capability results without learner response bodies.

Probe failures disable the capability; they never silently downgrade validation.

## Purpose risk tiers

### Tier 1 — secondary preferred after probe

- Story/dialogue, exercise/content, and daily-surprise drafts before validation.
- Cosmetic text and progress-report wording from supplied facts.
- Topic classification, deduplication assistance, and non-authoritative hints.

### Tier 2 — secondary allowed with validation

- Contextual explanations and feedback wording.
- Mini-dialogue continuation constrained by a scene schema.
- Vocabulary hints checked for answer leakage.

Tier 2 requires schema validation, safety checks, deterministic fact constraints, and OpenAI/curated fallback.

### Tier 3 — learning-critical, primary only initially

- Effective grammar evaluation.
- Error classification producing mastery evidence.
- Unit-challenge adjudication.
- Any output consumed by Learning projections.

The secondary provider may run in shadow mode for Tier 3. Promotion requires explicit owner approval after the golden corpus meets approved thresholds by GrammarPoint/CEFR, not only aggregate accuracy.

### Forbidden direct AI decisions

Mastery writes, review scheduling, level unlock, achievement grant, streak mutation, publication, authentication, authorization, secret selection, and provider routing.

## Routing policy

Routing inputs are purpose, required capability, privacy class, cost budget, health, and pinned policy version. Default order:

1. Deterministic/curated implementation when sufficient.
2. Verified secondary provider for Tier 1/approved Tier 2.
3. OpenAI fallback.
4. Curated fallback or safe `SYSTEM_REVIEW` with zero negative evidence.

Each call pins provider, model, protocol, prompt/schema versions, timeout, retry budget, and fallback reason.

## Resilience and cost controls

- Per-provider timeout and at most two transient retries with jitter.
- Circuit breaker after a configured rolling failure threshold.
- Normalize and respect rate-limit/retry-after signals.
- Per-purpose daily request/token budgets.
- No retry on authentication, schema, safety, or unsupported-model failure.
- Content generation is batchable, resumable, and idempotent.
- Runtime learning remains usable when either or both providers are unavailable.

## Privacy classes

- `PUBLIC_CONTENT`: published GrammarPoint and generic authoring inputs.
- `PSEUDONYMOUS_LEARNING`: minimum exercise context and learner answer required for evaluation.
- `PRIVATE_STORY`: bounded story state without identity/account fields.
- `SECRET`: keys/authentication data; never prompt input.

Until the secondary provider's retention/privacy terms are reviewed, it receives `PUBLIC_CONTENT` only. Sending learner answers or private story memory requires a contract status change and owner approval.

## Observability

Persist safe metadata: purpose, provider/model/protocol, policy/prompt/schema versions, status, normalized error, latency, tokens when available, fallback chain, probe version, and request ID. Never persist authorization, raw provider payloads, or full learner answers in AI logs.

## Acceptance criteria

- Removing either key leaves deterministic paths and safe fallback functional.
- Unsupported structured output cannot enter publication or evaluation.
- Simulated 429/timeout/5xx uses bounded retry/fallback without duplicate records.
- Tier 3 secondary results cannot become effective before policy promotion.
- No key exists in tracked files, logs, browser code, or database snapshots.
- Provider health/cost reports contain no learner answer text.
