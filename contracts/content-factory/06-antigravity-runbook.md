# Antigravity Execution Rules

## Mandatory start

Antigravity MUST read the declared contracts and machine schemas, inspect current code/content/migrations, print a scope summary, compute current code registry and coverage, and create a dry-run plan. If a schema/contract is missing or contradictory, stop with `CONTRACT_CONFLICT`; do not improvise.

## Allowed autonomous work

- create versioned manifest proposals;
- generate bounded DRAFT grammar/exercise artifacts;
- run deterministic validators and independent structured review;
- revise within retry limits;
- produce fixtures, validation reports, dry-run diffs, and owner approval packages;
- resume idempotently after interruption.

## Forbidden work

- publishing or activating curriculum without matching owner approval;
- altering existing published versions, mastery/evaluation logic, thresholds, authentication, providers, secrets, or module boundaries;
- scraping external proprietary curricula;
- weakening tests/schemas/gates to make content pass;
- hiding/quashing findings or silently changing manifest identity;
- sending learner/private data to authoring providers.

## Recommended command workflow

The implementation SHOULD expose dry-run, plan, generate, validate, review, report, approve-record, publish, resume, and status commands. Every mutating command requires a run ID and idempotency key. Default mode is dry-run. Publish requires an explicit approved batch ID and exact hash confirmation.

## Handoff format

For every run Antigravity reports: requested/completed/quarantined counts, artifacts by state, validation/review failures, cost/usage, provider/model/prompt/schema versions, hashes, commands/tests executed, publication status, and owner actions required. It must explicitly say `NOT PUBLISHED` unless publication transaction succeeded.
