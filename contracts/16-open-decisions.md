# Product-owner Decisions

Decisions confirmed on `2026-08-16` are recorded below. Only the final implementation details listed afterward remain open.

| ID    | Confirmed decision                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-001 | Vietnamese-first curriculum progresses from the lowest level through advanced/C2. Build a small vertical slice first, then generate full coverage.                       |
| D-002 | TypeScript monorepo, Next.js, NestJS, PostgreSQL and Prisma; modular monolith only, no microservices.                                                                    |
| D-003 | Simple local login for a personal, single-laptop application. No external identity provider.                                                                             |
| D-004 | OpenAI API is the initial AI provider, accessed only from the backend through an adapter.                                                                                |
| D-005 | Evaluation may be asynchronous and the web flow must safely resume/poll.                                                                                                 |
| D-006 | AI generates the full curriculum. Validated published data—not live model output—is runtime source of truth. Owner may bulk-approve validation reports.                  |
| D-007 | Mastery thresholds and 40/35/25 session mix in contract 09 are approved as version `v1`.                                                                                 |
| D-008 | This is a personal local application; no elaborate retention/export regime is required. Basic secret protection and log minimization still apply.                        |
| D-009 | The product is not intended for children.                                                                                                                                |
| D-010 | Local deployment on one laptop; no cloud-scale design.                                                                                                                   |
| D-011 | Web only; no native mobile or offline synchronization.                                                                                                                   |
| D-012 | Personal-use workflow: CLI/import and validation report are sufficient; no full admin CMS.                                                                               |
| D-013 | Add a secondary OpenAI-compatible provider for cost control, initially restricted to probed public-content authoring; OpenAI remains learning-critical primary/fallback. |

## Remaining implementation details

### Secondary AI provider verification

- Candidate base URL: `https://api.17.wtf/v1`.
- Model catalog, protocol fidelity, structured output, rate limits, retention/privacy, upstream provenance, and SLA are unverified.
- Gate: capability probe plus owner review of provider terms before sending learner answers or private story state.
- Default: `PUBLIC_CONTENT` Tier 1 authoring only; Tier 3 remains shadow/non-effective.

- Exact local-login identifier: default to one username/password account.
- Exact OpenAI model: choose during implementation through a small structured-output quality/cost fixture; keep model configurable.
- Local PostgreSQL delivery: native install versus Docker Compose. Default recommendation is Docker Compose for reproducibility.
- Whether the web UI should expose an owner-only “approve curriculum batch” screen; default is no, use CLI/report.

These are implementation choices that do not alter domain boundaries. The recommended defaults may be used unless the owner overrides them.

## Known repository facts, not decisions

- `D:\Projects\english` was empty on `2026-08-16`.
- No existing stack, modules, database/schema/migrations, tests, Git history, or compatibility constraints were found.
- Initializing Git, installing dependencies, and writing feature code were intentionally not performed during contract creation.
