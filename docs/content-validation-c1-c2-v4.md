# Content Validation Report — C1/C2 Curriculum v4

Date: 2026-08-16  
Batch: `advanced-content-v4`  
Decision: approved for personal local use

## Scope

- 10 newly published C1 GrammarPoints and 12 newly published C2 GrammarPoints.
- Curriculum `PERSONAL_ENGLISH` release 4 contains one ordered A1–C2 path with 62 pinned GrammarPoint versions.
- 22 new translation exercises and 22 vocabulary senses, each with three progressive hints.

## Advanced-content design

- C1 covers inversion, focus, participle clauses, nominalisation, mandative subjunctive, hedging, cohesion, fronting, formal prepositional phrasing, and narrative tense control.
- C2 covers conditional inversion, nuanced pseudo-clefts and modality, mixed-time counterfactuals, argumentation markers, end-weight, literary viewpoint, embedded clauses, pragmatic softening, register shift, scope control, and structural parallelism.
- Complexity is justified by meaning, information structure, stance, discourse, or register; sentence length alone is not treated as proficiency.

## Automated validation

- All 22 bundles passed the versioned GrammarPoint JSON Schema at import.
- Every relationship target existed and the prerequisite graph remained acyclic.
- Every curriculum item pins an exact published version; release 4 retired release 3 without mutating prior releases.
- Each point includes three bilingual examples, a coded common error, generation/evaluation policy, and independent AI-authoring provenance.
- Each exercise includes Vietnamese context/source, explicit semantic requirements, non-exhaustive reference alternatives, a primary target, and progressive non-answer-revealing hints.

## Database evidence after publication

| Level     | Published points |
| --------- | ---------------: |
| A1        |               10 |
| A2        |               10 |
| B1        |               10 |
| B2        |               10 |
| C1        |               10 |
| C2        |               12 |
| **Total** |           **62** |

| Coverage check        |                Result |
| --------------------- | --------------------: |
| Grammar examples      |                   186 |
| Grammar relationships |                   183 |
| Published exercises   |                    62 |
| Vocabulary entries    |                    62 |
| Vocabulary hints      |                   186 |
| Active curriculum     | `PERSONAL_ENGLISH` v4 |

## Editorial and licensing notes

The batch was independently authored for this personal application without scraping or copying proprietary curriculum content. CEFR placement is an editorial estimate, not a certification claim. Reference answers remain examples rather than an exhaustive definition of correctness.

## Remaining review risk

Advanced items require real learner sessions to tune Vietnamese naturalness, register expectations, ambiguity, and evaluator consistency. Corrections must use new immutable content versions. Phase 6 should add end-to-end regression cases that exercise at least one item from every CEFR level.
