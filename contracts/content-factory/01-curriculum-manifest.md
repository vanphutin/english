# Curriculum Manifest Contract

## Output and scope

Before lesson bodies, Antigravity creates one complete manifest spanning A1–C2. Each item contains stable code, family, slug, Vietnamese/English title, CEFR, unit code/order, one-sentence assessable distinction, communicative functions, form/meaning/use boundaries, prerequisites, builds-on, contrasts, often-confused links, vocabulary domain, and rationale.

The manifest targets 230–265 items. Suggested distribution is A1 `28–34`, A2 `32–38`, B1 `38–45`, B2 `42–48`, C1 `42–50`, C2 `40–48`. Antigravity may vary inside these ranges to preserve correct granularity; it MUST NOT inflate counts by cosmetic subdivisions.

## Granularity tests

An item passes only if:

- it can be taught, exercised, and evaluated independently;
- success/failure can be attributed to its specific distinction;
- it is narrower than a broad tense/topic family;
- it is not merely a vocabulary list, spelling rule, activity type, or duplicate register label;
- contrast items define the precise distinguishing context.

## Coverage matrix

Manifest validation reports coverage across tense/aspect, clause structure, questions/negation, modality, conditionals, voice, reported language, noun phrase/determiners/quantity, comparison, complementation, relative/non-finite clauses, information structure, discourse cohesion, stance/hedging, register, ellipsis/substitution, and advanced counterfactual/scope patterns.

## Approval and immutability

No author job starts until the manifest is schema-valid, references resolve, prerequisite DAG is acyclic, duplicate/overlap findings are closed, level/unit ordering is coherent, and owner approval is recorded with manifest hash. Later additions require a new manifest version and impact report; approved codes cannot silently change meaning.

Machine authority: `curriculum-manifest.schema.json`.
