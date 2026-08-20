# Grammar Knowledge Base Contract

## Unit of knowledge

One GrammarPoint represents one assessable form-meaning-use distinction. Broad topics are families, not points. Example:

- Family: `PRESENT_PERFECT`
- Point: `PP_EXPERIENCE_EVER_NEVER`
- Contrast point: `PP_VS_PAST_SIMPLE_FINISHED_TIME`

Codes are uppercase snake case, stable forever, and meaningful. Retiring a point does not reuse its code.

## Required content per published version

- Identity: code, canonical slug, family, title, CEFR estimate.
- Learning intent in Vietnamese and English.
- Form: affirmative/negative/question structures and relevant morphology.
- Meaning/use conditions and pragmatic constraints.
- Signal words as hints only, never sufficient grading rules.
- Positive, negative, question, contextual, and contrastive examples.
- Common error patterns with independent error codes.
- Prerequisites and contrasts.
- Generation constraints and evaluator-specific checks.
- Tags, editorial provenance, reviewer, locale, semantic version/content hash.

## Conceptual bundle shape

```yaml
schemaVersion: '1.0'
code: PP_EXPERIENCE_EVER_NEVER
family: PRESENT_PERFECT
version: 1
cefr: A2
status: DRAFT
title: Present perfect for life experience
learningObjectiveVi: '...'
form:
  patterns: ['subject + have/has + past participle']
meaning:
  uses: ['experience before now without a finished time']
usageConstraints: []
relationships:
  prerequisites: [PAST_PARTICIPLE_COMMON]
  contrastsWith: [PAST_SIMPLE_FINISHED_TIME]
rules: []
examples: []
commonErrors: []
generationPolicy: {}
evaluationPolicy: {}
```

A machine-readable JSON Schema MUST be created before bulk content authoring.

## Relationship semantics

- `PREREQUISITE`: target should be sufficiently learned before source is introduced; graph MUST be acyclic.
- `BUILDS_ON`: useful ordering dependency but not a hard unlock.
- `CONTRASTS_WITH`: deliberate mixed practice pair; normally symmetric.
- `OFTEN_CONFUSED_WITH`: error remediation pair; normally symmetric.
- `PART_OF`: taxonomy only; never used as mastery evidence by itself.

## Publication workflow

`DRAFT -> IN_REVIEW -> PUBLISHED -> RETIRED`.

Publication requires schema validation, unique codes, complete required fields, no broken references/cycles, valid examples, explicit licensing/provenance, editorial review, evaluator fixtures, and a deterministic content hash. Published versions are immutable.

## Content quality rules

- Do not claim a single wording is the only correct English answer when alternatives exist.
- Rules distinguish hard constraints from tendencies.
- Examples do not rely on stereotypes, unsafe content, or unexplained culture-specific assumptions.
- CEFR is an editorial placement estimate, not an official certification claim.
- AI is expected to generate the complete A1-C2 curriculum. Every generated bundle MUST pass machine validation, dependency-graph validation, duplicate/contradiction checks, example/evaluator fixtures, and a review-state gate before publication. For this personal application, the owner may approve a validated batch rather than manually editing every item.
- Proprietary sources must not be copied/scraped without an explicit compatible license.

## AI-first full-curriculum workflow

1. Generate a curriculum map from A1 through C2 before generating lesson bodies.
2. Validate stable codes, granularity, coverage, prerequisites, contrasts, and acyclic dependencies.
3. Generate GrammarPoint versions in bounded batches with the pinned generation schema/model/prompt.
4. Run automated structural, linguistic-consistency, duplication, licensing/provenance, and evaluator-fixture checks.
5. Produce a validation report for the owner. The owner approves/rejects the batch; approval may be bulk approval for personal use.
6. Publish immutable versions and retain generation/validation provenance.

AI generation may be comprehensive, but generation completion is not publication. Failed or uncertain points remain draft and cannot appear in learner sessions.
