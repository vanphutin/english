# Coding Conventions

## General

- Strict TypeScript; no implicit `any`, unchecked casts, or non-null assertions without justification.
- Names reflect domain language from these contracts. Do not invent synonyms for core concepts.
- Prefer small pure domain policies and explicit application use cases over large generic services.
- Use dependency injection through ports. Domain code uses an injected clock/ID generator where determinism matters.
- Handle expected failures with typed errors/results; map them to stable API error codes at transport boundaries.
- Validate environment configuration at startup and all external input at runtime.

## Important comments

Comments explain **why**, invariants, policy rationale, non-obvious edge cases, security/privacy choices, and external constraints. Every important function implementing evaluation adjudication, mastery/progression, exercise validation/selection, publication, idempotency, transaction/outbox behavior, or privacy redaction MUST have a concise doc comment describing its contract and invariants. Do not comment obvious syntax or use comments to compensate for unclear names.

## Database

- Repositories are module-private. Controllers and UI never use ORM entities.
- Avoid unbounded queries and N+1 access; pagination is required for collections.
- Transactions live in application use cases, not hidden inside low-level helpers.
- Money/cost uses exact decimal types; timestamps remain UTC; user timezone is presentation/scheduling context.
- Review generated SQL migrations, constraints, indexes, and delete behavior.

## API and schemas

- OpenAPI/JSON Schema first; generated DTO/client types SHOULD be used where practical.
- Never maintain multiple handwritten definitions of the same wire schema.
- Reject unknown AI output properties and malformed enums.
- Public enums need an unknown/future-value strategy in generated clients.

## Logging and secrets

- Structured logs include request/job/attempt correlation IDs.
- Never log tokens, credentials, full provider payloads, or learner answers by default.
- The OpenAI API key remains server-side in local environment configuration and is never embedded in frontend bundles.
- Errors preserve internal causes in protected logs but return safe messages publicly.

## Repository hygiene

- Keep feature changes inside the owning module and contract changes in the same review.
- No committed secrets, generated build output, local databases, or production learner data.
- Formatting, lint, type-check, unit/integration tests, migration validation, and contract checks run in CI.
- Dependencies require a reason; do not add overlapping libraries casually.
