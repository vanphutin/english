# Architecture Principles

## Recommended architecture

Use a **modular monolith** with a separate web application and background worker inside one monorepo. Microservices are explicitly out of scope. Approved stack:

- TypeScript throughout.
- Web: Next.js/React.
- API and worker: NestJS.
- Database: PostgreSQL.
- ORM/migrations: Prisma, with SQL migrations reviewed as first-class artifacts.
- Background work: an in-process/persistent database-backed job mechanism first. Redis/BullMQ is unnecessary for the single-laptop local deployment unless measurements later justify it.
- Contract validation: OpenAPI + JSON Schema; runtime validation at all trust boundaries.
- Tests: Vitest/Jest, API integration tests against PostgreSQL, Playwright for critical flows.

Target deployment is local-only on one personal laptop. The domain contracts do not depend on this stack. A stack change MUST preserve the boundaries and invariants below.

## Principles

1. **Contract first:** change semantic contracts before schema, API, or UI implementation.
2. **One deployable, strict modules:** modules communicate through public application services or domain events, never another module's repository.
3. **PostgreSQL is the transactional authority:** do not use a vector database or document store as the primary record.
4. **AI is an untrusted adapter:** validate structured output; apply deterministic business rules after it.
5. **Immutable evidence:** attempts, evaluations, and mastery events are append-oriented. Corrections supersede; they do not erase history.
6. **Idempotency:** submission, evaluation completion, and mastery application MUST tolerate retries.
7. **Version everything that affects learning:** content, generator policy, prompt, evaluator rubric, and mastery policy.
8. **Privacy by design:** send only data required for evaluation; never place secrets or unnecessary profile data in prompts/logs.
9. **Observable decisions:** persist reason codes and trace IDs, not hidden decisions only inside prose.
10. **Simple before distributed:** add queues, cache, search, or services only for demonstrated operational need.

## Source-of-truth map

| Concern                        | Authority                                                         |
| ------------------------------ | ----------------------------------------------------------------- |
| Product/domain semantics       | `contracts/`                                                      |
| Physical database state        | Ordered migrations                                                |
| HTTP shapes                    | `openapi/openapi.yaml` (roadmap phase 1)                          |
| Grammar import/AI output shape | Versioned JSON Schemas                                            |
| Published curriculum           | Versioned PostgreSQL records seeded from reviewed content bundles |
| User learning state            | PostgreSQL attempts + mastery event ledger/projections            |
| Frontend server state          | API; client cache is disposable                                   |
| Secrets/config                 | Deployment environment/secret manager; never repository defaults  |

## Transaction boundaries

- Creating a session and its initial plan is one transaction.
- Submitting an attempt is one transaction and returns a stable attempt ID.
- AI evaluation may be asynchronous. Persist result and outbox event atomically.
- Mastery consumes an evaluation once using a unique idempotency key.
- Publishing curriculum validates the complete dependency graph in one controlled operation.

## Security baseline

- Use a simple local account and a proven session/password library; password hashes MUST use the library's secure password hashing. Do not implement cryptography manually or add an external identity provider for MVP.
- Authorization is checked in the application layer for every user-owned resource.
- Rate-limit submission, hints, and AI endpoints per user/device/IP as appropriate.
- Encrypt transport; protect provider keys; redact prompts and learner text according to log policy.
- Treat grammar bundle uploads, LLM output, and learner input as untrusted.
