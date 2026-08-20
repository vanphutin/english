# ADR 0001: TypeScript modular monolith

- Status: Accepted
- Date: 2026-08-16

## Decision

Use a pnpm TypeScript monorepo with Next.js web, NestJS API/worker, PostgreSQL, and Prisma. Keep bounded contexts as strict modules in one deployable system. Do not introduce microservices.

## Rationale

The application runs locally for one user. A modular monolith preserves domain boundaries without distributed deployment, network failure, duplicated contracts, or operational overhead.

## Consequences

Cross-module access occurs only through public application interfaces/events. Physical foreign keys do not grant repository ownership. A future extraction requires measured need and an explicit ADR.
