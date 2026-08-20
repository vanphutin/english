# Exercise Generation Contract

## Purpose

Generate a concrete, fair opportunity to demonstrate a pinned GrammarPoint version while preserving Vietnamese meaning and controlling irrelevant difficulty.

## Inputs

- User/curriculum placement and mastery snapshot (minimal fields only).
- Primary target and optional review targets with exact versions.
- Difficulty, exercise type, locale, vocabulary ceiling, recent-context exclusions.
- Generation policy version and deterministic seed when supported.

## Required output

- Vietnamese context/source sentence and learner instruction.
- Primary/secondary targets and weights.
- Semantic requirements: actors, tense/time reference, polarity, modality, quantities, required propositions.
- Allowed variation and forbidden ambiguity.
- Multiple reference answers where applicable.
- Evaluator rubric version.
- Progressive vocabulary hints.
- Provenance: `CURATED | TEMPLATE | AI_DRAFT`, generator/prompt/model versions, seed, validation results.

## Pipeline

1. Select targets through Learning policy; generator MUST NOT decide progression.
2. Load published grammar/version and safe vocabulary constraints.
3. Build from a curated template when available; otherwise request a structured AI draft.
4. Validate JSON schema, target compatibility, language presence, length, ambiguity, answer leakage, and prohibited content.
5. Run deterministic reference checks and optional independent evaluator preflight.
6. Reject/regenerate within a strict attempt/cost limit; fall back to curated content.
7. Persist an immutable evaluable snapshot before presenting it.

## Quality invariants

- The target must be natural, not merely technically insertable.
- Vietnamese context must provide enough meaning to judge tense/aspect without forcing unnatural literal translation.
- Untargeted grammar/vocabulary should be at or below the learner's controlled level.
- Reference answers are examples, not exhaustive truth.
- Hints reveal progressively: concept -> lemma/phrase -> limited form clue. Full answers are never pre-attempt hints.
- Avoid near-duplicate recent exercises through normalized semantic/content hashes.
- Generated content is not published curriculum knowledge.

## Failure behavior

Invalid/ambiguous generation is never shown. Log reason codes such as `SCHEMA_INVALID`, `TARGET_NOT_REQUIRED`, `AMBIGUOUS_TIME_REFERENCE`, `ANSWER_LEAK`, `VOCAB_TOO_HARD`, `UNSAFE_CONTENT`. After retry budget exhaustion, serve a curated/template exercise or end the session item gracefully without penalizing the learner.

## Versioning and reproducibility

Store the policy, prompt template, model, input content versions, output schema, validation results, and final snapshot. A future model change must not change how an already-presented exercise is evaluated unless a reviewed superseding evaluation is created.

## Content diversity and rotation policy

- Each published GrammarPoint SHOULD have at least 12 validated exercises before it is considered learner-ready; A1-A2 SHOULD grow toward 20 and B1-C2 toward 30.
- Persist `variationGroup`, `topic`, normalized `semanticHash`, generator/model provenance, and validation reason codes in the immutable exercise snapshot.
- A session MUST prefer distinct primary GrammarPoints before selecting a second variation of the same point.
- Selection MUST exclude exact recent exercises when enough alternatives exist and MUST use a reproducible per-session seed instead of creation order.
- AI-authored exercises pass the same schema, completeness, duplication, ambiguity, answer-leak, and target-necessity gates as curated content before publication.

# Activity presentation contract v1

Every newly authored exercise MUST use an activity type approved in
`17-engagement-learning-experience.md` and carry `semanticHash` and `topicCode` diversity metadata.
`packages/contracts/schemas/exercise-activity.schema.json` is the machine-readable authority.

- `semanticHash` groups exercises that test the same intended meaning, including variants with a
  different UI activity. Two items with the same hash MUST NOT appear in one session.
- `topicCode` is an approved coarse context category and contains no learner data.
- `promptPayload` contains presentation affordances only. It MUST NOT replace pinned targets,
  semantic requirements, reference alternatives, or evaluator policy.
- `TRANSLATE_CONTEXT` remains backward compatible. Other v1 activities still produce one English
  answer string, allowing the existing evaluation boundary to remain authoritative.
- Authoring MAY derive safe variants from a published base exercise, but every variant is separately
  validated and published with immutable provenance.

Activity-specific payloads:

- `CORRECT_ERROR`: `incorrectSentence`, `errorCode`; accepted output is a corrected English sentence.
- `TRANSFORM_SENTENCE`: `sourceSentence`, `transformationGoalVi`; accepted output preserves the
  supplied meaning while using the pinned target form.
- `SELECT_IN_CONTEXT`: `choices`; the learner returns the complete best English choice, not an index.
- `GUIDED_WRITING`: `requiredElements`; the learner writes one bounded sentence satisfying the
  pinned meaning and form.

Correction items MUST originate from reviewed Grammar KB error/correction pairs or validated AI
authoring. Transformation items MUST pass a target-necessity check and MUST NOT be produced by blind
token substitution. Exact reference matching remains a fast path; natural alternatives go through
the same layered evaluator with `activityType` and presentation payload included as untrusted data.
