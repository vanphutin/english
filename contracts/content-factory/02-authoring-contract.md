# Grammar and Exercise Authoring Contract

## Grammar author input

The author receives exactly one approved manifest item, allowed neighboring summaries, existing code registry, level vocabulary ceiling, schema/policy/prompt versions, source/license policy, and deterministic job seed. It does not receive secrets, learner answers, mastery data, or freedom to modify the manifest.

## Grammar author output

Output MUST conform to `grammar-point.schema.json`, remain `DRAFT`, and include:

- Vietnamese and English objectives;
- explicit form patterns and morphology;
- separate meaning/use conditions and exclusions;
- hard constraints versus tendencies;
- affirmative, negative, question, contextual, and contrastive examples where applicable;
- at least three independent common-error codes relevant to Vietnamese learners when evidence supports them;
- exact approved relationships;
- generation/evaluation policies and evaluator fixtures;
- AI provenance and `PUBLIC_CONTENT` licensing declaration.

The author MUST use original wording. It may use general linguistic knowledge but cannot quote or reproduce a proprietary course/profile.

## Exercise author input/output

Exercises are generated only after the GrammarPoint bundle passes grammar validation. Each batch pins exact point version/hash, activity mix, topic mix, CEFR vocabulary ceiling, semantic exclusions, schema/prompt versions, and seed.

Every exercise follows `07-exercise-generation.md` and `exercise-activity.schema.json`. A batch also supplies target-necessity evidence, ambiguity notes, multiple acceptable references, forbidden meaning changes, progressive hints, variation group, topic code, semantic hash, and provenance.

Minimum readiness is 12 validated exercises per point. Target mix includes at least four activity types and six topic contexts when natural. No single activity exceeds 40% of a point bank. Exact or semantic duplicates do not count toward readiness.

## Retry bounds

Maximum author attempts per artifact is 3. A retry receives structured finding codes, not hidden reviewer reasoning. Three failed attempts transition to `QUARANTINED`; Antigravity continues other independent items and reports the blocker.
