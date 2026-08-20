# Approval, Publication, and Rollback Contract

## Owner approval

The owner may bulk-approve a validated batch for personal use. Approval pins exact manifest/artifact/review/validation hashes; a changed artifact invalidates approval. Antigravity may prepare the approval report but cannot create the owner decision.

The report includes counts by CEFR/unit/status, quality distribution, all warnings and accepted rationales, quarantined items, graph/coverage diff, exercise readiness, provider/cost metadata, fixture result, and publication impact.

## Publish preconditions

- approved manifest version;
- exact artifact hashes remain unchanged;
- all required schemas/validators/reviews pass;
- zero unresolved ERROR/BLOCKING findings;
- fixtures pass and minimum exercise readiness is met;
- owner approval matches scope;
- code/version uniqueness and relationship references rechecked inside the transaction.

Publication is atomic per approved batch or declared sub-batch. Published GrammarPoint and exercise versions are immutable. Curriculum release creation is a separate owner-approved operation that pins published versions; publishing content alone does not silently replace the learner's active release.

## Rollback

Never edit/delete historical published content. Operational rollback switches the active curriculum release to a prior immutable release or publishes a corrected higher version. Attempts/evaluations/mastery retain the versions originally used.
