# Repository Working Agreement

## Mandatory contract gate

Before coding, read `contracts/README.md`, the product/architecture/domain contracts, and every behavior-specific contract touched by the change. `contracts/15-ai-working-rules.md` is mandatory.

## Structure

- `apps/web`: learner UI only; server state remains authoritative.
- `apps/api`: NestJS HTTP composition root.
- `apps/worker`: background job composition root.
- `modules/*`: bounded contexts with domain/application/infrastructure/transport layers.
- `packages/*`: small shared technical packages; never a dumping ground for domain logic.
- `openapi` and `packages/contracts/schemas`: machine-readable authorities.
- `prisma`: physical data model and forward-only migrations.

## Non-negotiable rules

- Modular monolith only. No microservices, cross-module repository access, or frontend database access.
- AI output is untrusted and cannot directly change curriculum publication, mastery, progression, or authorization.
- Change contracts/OpenAPI/JSON Schema before or with behavioral code.
- Important policy/idempotency/transaction/safety functions need concise comments explaining why and invariants.
- Preserve user changes; do not edit an applied migration.
- Run contract validation, database validation, formatting, lint, typecheck, tests, and relevant builds.

## Verifiable guideline gate

The CI verifier parses this block; the commands are then executed as separate CI steps so failure cannot be hidden by the verifier itself.

```codex-guidelines
{
  "version": 1,
  "scope": ".",
  "commands": {
    "format": "pnpm format:check",
    "lint": "pnpm lint",
    "test": "pnpm test"
  }
}
```
