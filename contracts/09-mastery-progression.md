# Mastery and Progression Contract

## Principle

Mastery is a policy-owned projection of evidence, not a raw accuracy percentage and not an LLM score. Store immutable evidence events so policy changes can rebuild projections.

## Evidence inputs

- Effective evaluation disposition and dimension results.
- Whether the target was primary/secondary.
- Attempt number, elapsed time, hint levels, answer reveal, and correction exposure.
- Exercise difficulty/generation confidence.
- Recency and independence from near-duplicate items.
- Human override/system-review status.

## Evidence rules

- Independent correct first attempts carry the highest positive weight.
- Correct retries and hint-assisted answers carry reduced weight.
- Seeing a full correction cannot produce independent-success evidence.
- Target failure produces negative evidence; incidental style issues do not reduce target mastery.
- System/provider failures produce zero evidence.
- Secondary targets may yield limited evidence only when the exercise explicitly declares them assessable.
- One effective evaluation generates at most one idempotent event per grammar point.

## Projection fields

`masteryScore (0..100)`, `retentionScore (0..100)`, `confidence (0..1)`, evidence/independent/assisted counts, band, streak, `lastPracticedAt`, and `nextReviewAt`.

Policy version `v1` approved behavior:

- New evidence updates a bounded weighted score with recency weighting; do not use a simple lifetime average.
- Confidence rises with diverse, independent evidence and decays slowly without evidence.
- Review interval expands on independent success and contracts on failure.
- Exact coefficients MUST live in a pure, versioned policy with golden tests, not scattered constants.

## Bands (approved initial thresholds)

| Band       | Rule summary                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| UNSEEN     | no valid evidence                                                                                        |
| LEARNING   | score < 50 or fewer than 3 valid pieces                                                                  |
| PRACTICING | score 50-79                                                                                              |
| MASTERED   | score >= 80, confidence >= 0.70, at least 5 valid and 3 independent successes across at least 2 sessions |
| REVIEW_DUE | mastered and `nextReviewAt <= now`                                                                       |
| AT_RISK    | previously mastered, then retention/score < 70 or repeated recent failures                               |

These thresholds are approved for policy `v1`; later tuning requires a new policy version and regression tests.

## Session selection

Approved default mix: 40% current/new curriculum targets, 35% due review, 25% weak/at-risk. Reallocate empty buckets; do not fill with duplicates merely to meet percentages. Respect prerequisites, recent-item exclusion, session length, and content availability.

Implementation policy `session-selection-v1` classifies each primary target from the persisted mastery projection, prefers exercises absent from recent completed sessions, stores the selected bucket in `session_items.selection_reason`, and deterministically reallocates unavailable buckets. `REVIEW` sessions prioritize 60% due and 40% weak targets before fallback.

## Level unlock

A level unlock is based on required grammar only:

- all hard prerequisites mastered;
- at least 80% of required points mastered;
- no required point below 60 after minimum evidence;
- mixed-practice accuracy at least 75% over a minimum sample;
- at least one delayed-review success for core targets.

Unlock creates an auditable event and does not prevent review of earlier levels. Users MAY preview locked material only if product settings allow; preview produces no progression advantage by default.

Policy `level-progression-v1` updates `level_progress` after effective mastery evidence. The enrollment's `current_level_id` is the only source of truth used by later session planning. Completion/unlock updates run in the same transaction and a first unlock writes `LEVEL_UNLOCKED` to `audit_log`.

## Rebuild and correction

Projections MUST be reproducible from the event ledger and policy version. Overrides create compensating/superseding evidence; never edit historical mastery events. Provide an admin rebuild command and consistency check before production launch.
