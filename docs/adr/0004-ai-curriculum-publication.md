# ADR 0004: AI-authored, validation-gated curriculum

- Status: Accepted
- Date: 2026-08-16

## Decision

AI generates the complete A1-C2 knowledge base in bounded batches. Runtime learning uses only immutable versions that pass schema, dependency, duplication, consistency, fixture, safety, and provenance checks and are bulk-approved by the owner.

## Consequences

Generation is never publication. Uncertain or invalid content remains draft. Proprietary curriculum is not copied without a compatible license.
