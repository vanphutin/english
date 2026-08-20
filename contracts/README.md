# English Grammar Learning App — Contract Index

Status: **Approved baseline**  
Contract version: `0.3.0`  
Last updated: `2026-08-17`

This directory is the product and engineering source of truth. Every human or AI contributor MUST read this file and the contracts relevant to a change before writing code.

## Reading order

1. [00-product-scope.md](./00-product-scope.md)
2. [01-architecture-principles.md](./01-architecture-principles.md)
3. [02-domain-model.md](./02-domain-model.md)
4. [03-database-erd.md](./03-database-erd.md)
5. [04-module-boundaries.md](./04-module-boundaries.md)
6. [05-api-contracts.md](./05-api-contracts.md)
7. [06-grammar-knowledge-base.md](./06-grammar-knowledge-base.md)
8. [07-exercise-generation.md](./07-exercise-generation.md)
9. [08-ai-evaluator.md](./08-ai-evaluator.md)
10. [09-mastery-progression.md](./09-mastery-progression.md)
11. [10-vocabulary-assistant.md](./10-vocabulary-assistant.md)
12. [11-frontend-state-flow.md](./11-frontend-state-flow.md)
13. [12-coding-conventions.md](./12-coding-conventions.md)
14. [13-testing-acceptance.md](./13-testing-acceptance.md)
15. [14-implementation-roadmap.md](./14-implementation-roadmap.md)
16. [15-ai-working-rules.md](./15-ai-working-rules.md)
17. [16-open-decisions.md](./16-open-decisions.md)
18. [17-engagement-learning-experience.md](./17-engagement-learning-experience.md)
19. [18-ai-provider-routing.md](./18-ai-provider-routing.md)
20. [19-autonomous-content-factory.md](./19-autonomous-content-factory.md)
21. [Content Factory contract pack](./content-factory/README.md)

## Authority and change control

- Product/domain meaning is defined here, not inferred from UI, prompts, ORM models, or generated code.
- Database migrations are the physical schema authority after implementation begins; this directory remains the semantic authority.
- The OpenAPI document will be the transport authority. DTOs and generated clients MUST conform to it.
- JSON Schema files for grammar content and AI structured output will be machine-readable authorities once introduced in roadmap phase 1.
- Prompts are implementation details. They MUST NOT redefine grading, mastery, or curriculum rules.
- A conflicting decision requires a contract change first, a short rationale, impact analysis, and explicit product-owner approval.

## Normative language

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative. Confirmed product-owner decisions and the few remaining implementation defaults are recorded in [16-open-decisions.md](./16-open-decisions.md).

## Current repository status

The modular-monolith vertical slice, published A1-C2 curriculum, local PostgreSQL persistence, learner roadmap, practice/evaluation/mastery loop, and AI-backed authoring/evaluation adapters are implemented. Contracts continue to govern future expansion; roadmap phases distinguish implemented foundations from engagement work not yet built.
