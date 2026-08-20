# Content Validation Report — B1/B2 Curriculum v3

Date: 2026-08-16  
Batch: `intermediate-content-v3`  
Decision: approved for personal local use

## Scope

- 10 newly published B1 GrammarPoints and 10 newly published B2 GrammarPoints.
- Curriculum `PERSONAL_ENGLISH` release 3 contains the complete ordered A1–B2 path.
- 20 new translation exercises and 20 vocabulary senses, each with three progressive hints.

## Automated validation

- All 20 bundles passed the versioned GrammarPoint JSON Schema at the import boundary.
- Every prerequisite existed before its dependent point was imported; the hard prerequisite graph remained acyclic.
- Every curriculum item pins an exact published GrammarPoint version.
- Release 3 publication retired release 2 without mutating either older release.
- Each point includes three bilingual examples, a coded common error, generation/evaluation policy, and independent AI-authoring provenance.
- Reference answers remain non-exhaustive and exercises include explicit target and semantic requirements.

## Database evidence after publication

| Check                 |                Result |
| --------------------- | --------------------: |
| Published A1 points   |                    10 |
| Published A2 points   |                    10 |
| Published B1 points   |                    10 |
| Published B2 points   |                    10 |
| Grammar examples      |                   120 |
| Grammar relationships |                   105 |
| Published exercises   |                    40 |
| Vocabulary entries    |                    40 |
| Vocabulary hints      |                   120 |
| Active curriculum     | `PERSONAL_ENGLISH` v3 |

## Editorial and licensing notes

The batch was independently authored for this personal application without scraping or copying a proprietary curriculum. CEFR placement is an editorial estimate. The B1/B2 points are separated by assessable form–meaning distinctions rather than broad textbook chapter labels.

## Remaining review risk

Real learner sessions are still needed to tune Vietnamese naturalness, ambiguity, lexical ceilings, and difficulty ordering. Corrections must be released as new immutable versions rather than editing the published records.
