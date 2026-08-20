# AI Contributor Working Rules

These rules are mandatory for any AI coding agent.

## Before coding

1. Read `contracts/README.md`, `00-product-scope.md`, `01-architecture-principles.md`, `02-domain-model.md`, the owning module contract, and all behavior-specific contracts affected by the task.
   Engagement work MUST also read `17-engagement-learning-experience.md`; provider/AI cost-routing work MUST also read `18-ai-provider-routing.md`.
   Autonomous curriculum/content work MUST also read `19-autonomous-content-factory.md` and every file under `contracts/content-factory/` in its declared order.
2. Inspect repository guidance (`AGENTS.md`), current code, migrations, tests, OpenAPI, and JSON Schemas. Do not assume the stack or structure from memory.
3. State the intended module, invariants, files, migrations/API effects, and validation plan.
4. If code and contracts conflict, stop and report the conflict. Do not silently choose one.

## Decision constraints

- MUST NOT change product scope, domain meanings, source-of-truth ownership, mastery thresholds/policy, grading semantics, published content rules, module ownership, or public contracts without explicit user/product-owner approval and a preceding contract update.
- MUST NOT let an LLM response directly write mastery, progression, authorization, or publication state.
- A content-generating agent MUST NOT publish, overwrite published versions, bypass review findings, silently repair unknown domain decisions, or expand beyond the approved curriculum manifest. It writes artifacts only through the Content Factory state machine.
- MUST NOT invent database fields/enums or API behavior that contradicts these contracts.
- MUST NOT copy proprietary curriculum or include unverified licensed material.
- MUST ask when an open decision materially changes architecture or user behavior. Reasonable local implementation details may be chosen and documented.
- MUST preserve user changes and avoid unrelated refactors.

## Implementation rules

- Work in the owning module; use public ports/events across boundaries.
- Update OpenAPI/JSON Schema before or with implementation. Add forward-only migrations for persistence changes.
- Make writes idempotent where specified and transactions explicit.
- Validate all learner, content, and AI inputs at trust boundaries.
- Add concise doc comments to important functions when they explain policy, invariants, safety, idempotency, transactions, or non-obvious reasoning. Do not add noise comments.
- Never log secrets, full AI payloads, or learner answers by default.
- Add tests for success, boundary, failure, retry, authorization, and regression cases proportional to the change.

## Definition of done for an AI change

- The relevant contract is satisfied and no unrelated decision changed.
- Formatting, lint, type-check, tests, schema/contract validation, and relevant migrations pass.
- Changed public behavior is documented and version-compatible.
- Important decisions and assumptions appear in the handoff summary.
- The agent lists changed files, verification performed, remaining risks, and any required human review.

## Forbidden shortcuts

- Hardcoding policy constants in controllers/UI/prompts.
- Treating a reference answer as the only valid answer.
- Mutating published content or historical evidence.
- Replacing authorization with client-side checks.
- Swallowing AI/provider errors or awarding negative evidence for system failure.
- Building feature code before phase-0 blocking decisions are approved.
